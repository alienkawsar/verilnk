"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllReports = exports.createReport = void 0;
const client_1 = require("../db/client");
const verification_service_1 = require("./verification.service");
const createReport = async (siteId, userId, reason, ipAddress) => {
    // Basic validation
    if (!reason || reason.trim().length === 0) {
        throw new Error('Reason is required');
    }
    // Call verification service to handle logic (counting, flagging, etc.)
    await (0, verification_service_1.handleReport)(siteId, userId, reason, ipAddress);
    // Fetch the last created report for this site to return correct object
    const report = await client_1.prisma.report.findFirst({
        where: { siteId, reason },
        orderBy: { createdAt: 'desc' }
    });
    if (!report)
        throw new Error('Report creation failed');
    return report;
};
exports.createReport = createReport;
const getAllReports = async () => {
    return client_1.prisma.report.findMany({
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
exports.getAllReports = getAllReports;
