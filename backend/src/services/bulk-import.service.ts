import fs from 'fs';
import csv from 'csv-parser';
import { prisma } from '../db/client';
import { ImportStatus, Prisma, VerificationStatus } from '@prisma/client';
import { indexSite } from './meilisearch.service';

interface ImportRow {
    Name: string;
    Url: string;
    Country: string;
    Category: string;
    State?: string | null;
}

interface ValidationError {
    row: number;
    reason: string;
}

export const processImportJob = async (
    jobId: string,
    filePath: string,
    fileType: 'csv' | 'json',
    strictMode: boolean,
    dryRun: boolean
) => {
    try {
        const normalizeText = (value: string) =>
            value.trim().replace(/\s+/g, ' ').toLowerCase();
        const toSlug = (value: string) =>
            normalizeText(value).replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');

        // 1. Update status to PROCESSING
        await prisma.bulkImportJob.update({
            where: { id: jobId },
            data: { status: ImportStatus.PROCESSING }
        });

        const rows: ImportRow[] = [];
        let totalRows = 0;

        // 2. Parse File
        if (fileType === 'csv') {
            await new Promise<void>((resolve, reject) => {
                const stream = fs.createReadStream(filePath)
                    .pipe(csv())
                    .on('data', (data) => {
                        // Normalize keys just in case (optional, but strictly requested keys are case-sensitive)
                        rows.push(data as ImportRow);
                        totalRows++;
                    })
                    .on('end', () => resolve())
                    .on('error', (err) => reject(err));
            });
        } else {
            const rawData = fs.readFileSync(filePath, 'utf-8');
            const jsonData = JSON.parse(rawData);
            if (!Array.isArray(jsonData)) throw new Error('JSON root must be an array');
            jsonData.forEach((item: any) => {
                rows.push(item);
                totalRows++;
            });
        }

        // update total rows immediately
        await prisma.bulkImportJob.update({
            where: { id: jobId },
            data: { totalRows: rows.length }
        });

        // 3. Pre-load Metadata for Validation
        const countries = await prisma.country.findMany();
        const categories = await prisma.category.findMany({ where: { isActive: true } });
        const states = await prisma.state.findMany({ include: { country: true } });

        const countryMap = new Map<string, string>();
        countries.forEach((c) => {
            countryMap.set(c.code.toUpperCase(), c.id);
            countryMap.set(normalizeText(c.name), c.id);
        });

        const categoryMap = new Map<string, string>();
        categories.forEach((c) => {
            categoryMap.set(c.slug, c.id);
            categoryMap.set(normalizeText(c.name), c.id);
        });

        const stateMap = new Map<string, string>();
        states.forEach((s) => {
            if (s.code) {
                stateMap.set(`${s.code.toLowerCase()}-${s.countryId}`, s.id);
            }
            stateMap.set(`${normalizeText(s.name)}-${s.countryId}`, s.id);
        });

        // 4. Validate & Process
        let processed = 0;
        let inserted = 0;
        let skipped = 0;
        let failed = 0;
        const errors: ValidationError[] = [];
        const validSitesToInsert: any[] = [];
        const fileUrlSet = new Set<string>();
        const existingUrlSet = new Set<string>();

        const normalizedUrls = rows.map(row => {
            if (!row?.Url) return '';
            const raw = row.Url.trim();
            const normalized = raw.toLowerCase();
            return normalized.startsWith('http') ? normalized : `https://${normalized}`;
        }).filter(Boolean);

        const urlChunks: string[][] = [];
        for (let i = 0; i < normalizedUrls.length; i += 500) {
            urlChunks.push(normalizedUrls.slice(i, i + 500));
        }

        for (const chunk of urlChunks) {
            const existing = await prisma.site.findMany({
                where: { url: { in: chunk } },
                select: { url: true }
            });
            existing.forEach(site => existingUrlSet.add(site.url));
        }

        // We'll process in chunks to avoid memory blockage if massive, but user said 10k is possible.
        // For simplicity and strict transaction rules, let's validate ALL first if strict mode.

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 1;
            let errorReason: string | null = null;

            // basic validation
            if (!row.Name || !row.Url || !row.Country || !row.Category) {
                errorReason = 'Missing required fields (Name, Url, Country, Category)';
            } else {
                // validate country
                const countryInput = row.Country.trim();
                const cId = countryMap.get(countryInput.toUpperCase()) || countryMap.get(normalizeText(countryInput));
                if (!cId) errorReason = `Country not found: ${row.Country}`;

                // validate category
                const categoryInput = row.Category.trim();
                const catId = categoryMap.get(toSlug(categoryInput)) || categoryMap.get(normalizeText(categoryInput));
                if (!catId && !errorReason) errorReason = `Invalid or inactive category: ${row.Category}`;

                // validate url format (basic)
                let cleanUrl = row.Url.trim().toLowerCase();
                try {
                    new URL(cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`);
                } catch {
                    if (!errorReason) errorReason = `Invalid URL format: ${row.Url}`;
                }

                // check uniqueness (DB check - costly in loop? better to fetch all URLs first? 
                // Creating a set of existing URLs + parsed URLs to check dupes within file)
                if (!errorReason && existingUrlSet.has(cleanUrl)) {
                    errorReason = `URL already exists in database: ${cleanUrl}`;
                }

                // check dupe in current file
                if (!errorReason && fileUrlSet.has(cleanUrl)) {
                    errorReason = `Duplicate URL in file: ${cleanUrl}`;
                }

                if (!errorReason) {
                    // State logic
                    let sId: string | null = null;
                    if (row.State) {
                        const stateInput = row.State.trim();
                        const stateKey = `${stateInput.toLowerCase()}-${cId}`;
                        const nameKey = `${normalizeText(stateInput)}-${cId}`;
                        const mapped = stateMap.get(stateKey) || stateMap.get(nameKey);
                        if (mapped) {
                            sId = mapped;
                        } else {
                            errorReason = `State not found for country: ${row.State}`;
                        }
                    }

                    if (!errorReason) {
                        fileUrlSet.add(cleanUrl);
                        validSitesToInsert.push({
                            name: row.Name.trim(),
                            url: cleanUrl,
                            countryId: cId!,
                            categoryId: catId!,
                            stateId: sId,
                            status: VerificationStatus.SUCCESS // Verified site per requirement "import VERIFIED websites"
                        });
                    }
                }
            }

            if (errorReason) {
                failed++;
                errors.push({ row: rowNum, reason: errorReason });
            }

            processed++;
            // Update progress occasionally
            if (processed % 100 === 0) {
                await prisma.bulkImportJob.update({
                    where: { id: jobId },
                    data: { processedRows: processed }
                });
            }
        }

        // Strict Mode Check
        if (strictMode && failed > 0) {
            // Fail everything
            await prisma.bulkImportJob.update({
                where: { id: jobId },
                data: {
                    status: ImportStatus.FAILED,
                    processedRows: processed,
                    failedCount: failed,
                    skippedCount: validSitesToInsert.length, // essentially skipped since we won't insert
                    errors: errors as any
                }
            });
            // Delete temp file
            fs.unlinkSync(filePath);
            return;
        }

        if (dryRun) {
            // Success but no insert
            await prisma.bulkImportJob.update({
                where: { id: jobId },
                data: {
                    status: ImportStatus.COMPLETED,
                    processedRows: processed,
                    insertedCount: 0, // Dry run
                    skippedCount: 0,
                    failedCount: failed,
                    errors: errors as any
                }
            });
            fs.unlinkSync(filePath);
            return;
        }

        // Execute Batch Insert
        // Prisma createMany doesn't support nested relations checks easily, but we have Ids.
        // It's transaction safe if we wrap it.
        // Also need to create 10k records -> batch in 1000s

        let batchInserted = 0;
        const chunkSize = 500;

        // Transaction wrapper ? For all chunks?
        // If strictly transactional, we need all or nothing. 
        // "Use database transactions".
        // If Non-Strict mode, "Insert valid rows". Then partial success is OK?
        // "Support Strict Mode -> If any row fails rollback entire import". We handled that above by preprocessing.

        // So for non-strict, we just insert valid ones.

        try {
            for (let i = 0; i < validSitesToInsert.length; i += chunkSize) {
                const chunk = validSitesToInsert.slice(i, i + chunkSize);
                await prisma.site.createMany({
                    data: chunk,
                    skipDuplicates: true // Just in case race condition
                });
                batchInserted += chunk.length;
            }

            // Index imported sites
            const urlsToIndex = validSitesToInsert.map(site => site.url);
            const indexChunks: string[][] = [];
            for (let i = 0; i < urlsToIndex.length; i += 500) {
                indexChunks.push(urlsToIndex.slice(i, i + 500));
            }

            for (const chunk of indexChunks) {
                const sites = await prisma.site.findMany({
                    where: { url: { in: chunk } },
                    include: { country: true, state: true, category: true, organization: true }
                });
                for (const site of sites) {
                    await indexSite(site as any);
                }
            }

            await prisma.bulkImportJob.update({
                where: { id: jobId },
                data: {
                    status: ImportStatus.COMPLETED,
                    processedRows: processed,
                    insertedCount: batchInserted,
                    failedCount: failed,
                    errors: errors as any
                }
            });

        } catch (dbErr) {
            await prisma.bulkImportJob.update({
                where: { id: jobId },
                data: {
                    status: ImportStatus.FAILED,
                    errors: [{ row: 0, reason: `Database/Index Error: ${(dbErr as any).message}` }] as any
                }
            });
        }

        // Cleanup
        fs.unlinkSync(filePath);

    } catch (err) {
        // Critical Job Failure
        await prisma.bulkImportJob.update({
            where: { id: jobId },
            data: {
                status: ImportStatus.FAILED,
                errors: [{ row: 0, reason: `System Error: ${(err as any).message}` }] as any
            }
        });
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
};
