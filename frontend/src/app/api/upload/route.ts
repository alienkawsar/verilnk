import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';

export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const file = formData.get("file");

        if (!file || !(file instanceof File)) {
            return NextResponse.json(
                { error: "No file received" },
                { status: 400 }
            );
        }

        console.log('Server received file:', file.name, file.type, file.size);

        if (!file.type.startsWith("image/")) {
            return NextResponse.json(
                { error: "Invalid file type" },
                { status: 400 }
            );
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        // Create unique filename to avoid collisions
        const filename = Date.now() + '-' + file.name.replace(/\s/g, '-');

        // Ensure directory exists
        const uploadDir = path.join(process.cwd(), 'public/uploads/countries');

        try {
            await mkdir(uploadDir, { recursive: true });
        } catch {
            // Ignore error if directory exists
        }

        const filepath = path.join(uploadDir, filename);
        await writeFile(filepath, buffer);

        console.log('File saved to:', filepath);

        return NextResponse.json({
            success: true,
            url: `/uploads/countries/${filename}`
        });

    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
