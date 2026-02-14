import { Request, Response } from 'express';
import { prisma } from '../db/client';
import { processImportJob } from '../services/bulk-import.service';
import { AdminRole } from '@prisma/client';
import path from 'path';
import fs from 'fs';

export const uploadImport = async (req: Request, res: Response): Promise<void> => {
    try {
        // Strict Super Admin Check
        const user = (req as any).user;
        if (!user || user.role !== AdminRole.SUPER_ADMIN) {
            if (req.file) fs.unlinkSync(req.file.path);
            res.status(403).json({ message: 'Access denied. Super Admin only.' });
            return;
        }

        if (!req.file) {
            res.status(400).json({ message: 'No file uploaded' });
            return;
        }

        const { strictMode, dryRun } = req.body;
        const isStrict = strictMode === 'true';
        const isDryRun = dryRun === 'true';

        // Validate File Type
        const ext = path.extname(req.file.originalname).toLowerCase();
        if (ext !== '.csv' && ext !== '.json') {
            fs.unlinkSync(req.file.path);
            res.status(400).json({ message: 'Invalid file format. Only .csv and .json allowed.' });
            return;
        }

        // Create Job Record
        const job = await prisma.bulkImportJob.create({
            data: {
                adminId: user.id,
                fileName: req.file.originalname,
                fileSize: req.file.size,
                status: 'PENDING'
            }
        });

        const fileType = ext === '.csv' ? 'csv' : 'json';

        // Trigger Background Process (fire and forget)
        processImportJob(job.id, req.file.path, fileType, isStrict, isDryRun);

        res.status(202).json({
            message: 'Import job started',
            jobId: job.id
        });

    } catch (error) {
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        console.error('Import Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getJobStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const user = (req as any).user;
        if (!user || user.role !== AdminRole.SUPER_ADMIN) {
            res.status(403).json({ message: 'Access denied.' });
            return;
        }

        const { id } = req.params;
        const job = await prisma.bulkImportJob.findUnique({ where: { id: id as string } });

        if (!job) {
            res.status(404).json({ message: 'Job not found' });
            return;
        }

        res.json(job);
    } catch (error) {
        console.error('Get Status Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
