import { prisma } from '../db/client';
import { VerificationStatus, Site } from '@prisma/client';
import { isTrustedDomain, REPORT_THRESHOLD, shouldFlagForReview } from './verification.rules';


export const verifySite = async (
    siteId: string,
    status: VerificationStatus,
    adminId: string | null,
    notes: string
): Promise<Site> => {
    const log = await prisma.verificationLog.create({
        data: {
            siteId,
            adminId,
            status,
            notes,
        },
    });

    return prisma.site.update({
        where: { id: siteId },
        data: { status },
    });
};

export const autoVerifySite = async (site: Site): Promise<Site | null> => {
    if (isTrustedDomain(site.url)) {
        return verifySite(
            site.id,
            VerificationStatus.SUCCESS,
            null, // System action
            'Auto-verified based on trusted domain suffix'
        );
    }
    return null;
};

export const handleReport = async (
    siteId: string,
    userId: string,
    reason: string,
    ipAddress?: string
): Promise<void> => {
    await prisma.report.create({
        data: {
            siteId,
            userId,
            reason,
            // ipAddress would go here if schema had it
        },
    });

    const reportCount = await prisma.report.count({
        where: { siteId },
    });

    if (shouldFlagForReview(reportCount)) {
        // Only flag if not already flagged or verified
        const site = await prisma.site.findUnique({ where: { id: siteId } });
        if (
            site &&
            site.status !== VerificationStatus.FLAGGED &&
            site.status !== VerificationStatus.SUCCESS
        ) {
            await verifySite(
                siteId,
                VerificationStatus.FLAGGED,
                null,
                `System flagged due to high report count (${reportCount})`
            );
        }
    }
};
