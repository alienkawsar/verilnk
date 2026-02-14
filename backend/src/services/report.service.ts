import { prisma } from '../db/client';
import { Report } from '@prisma/client';
import { handleReport } from './verification.service';

// const prisma = new PrismaClient();

export const createReport = async (
    siteId: string,
    userId: string,
    reason: string,
    ipAddress?: string
): Promise<Report> => {
    // Basic validation
    if (!reason || reason.trim().length === 0) {
        throw new Error('Reason is required');
    }

    // Call verification service to handle logic (counting, flagging, etc.)
    await handleReport(siteId, userId, reason, ipAddress);

    // Fetch the last created report for this site to return correct object
    const report = await prisma.report.findFirst({
        where: { siteId, reason },
        orderBy: { createdAt: 'desc' }
    });

    if (!report) throw new Error('Report creation failed');
    return report;
};

export const getAllReports = async (): Promise<Report[]> => {
    return prisma.report.findMany({
        include: {
            site: {
                select: {
                    name: true,
                    url: true,
                    status: true,
                },
            },
        },
        orderBy: {
            createdAt: 'desc',
        },
    });
};
