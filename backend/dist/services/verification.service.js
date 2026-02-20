"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleReport = exports.autoVerifySite = exports.verifySite = void 0;
const client_1 = require("../db/client");
const client_2 = require("@prisma/client");
const verification_rules_1 = require("./verification.rules");
const verifySite = async (siteId, status, adminId, notes) => {
    const log = await client_1.prisma.verificationLog.create({
        data: {
            siteId,
            adminId,
            status,
            notes,
        },
    });
    return client_1.prisma.site.update({
        where: { id: siteId },
        data: { status },
    });
};
exports.verifySite = verifySite;
const autoVerifySite = async (site) => {
    if ((0, verification_rules_1.isTrustedDomain)(site.url)) {
        return (0, exports.verifySite)(site.id, client_2.VerificationStatus.SUCCESS, null, // System action
        'Auto-verified based on trusted domain suffix');
    }
    return null;
};
exports.autoVerifySite = autoVerifySite;
const handleReport = async (siteId, userId, reason, ipAddress) => {
    await client_1.prisma.report.create({
        data: {
            siteId,
            userId,
            reason,
            // ipAddress would go here if schema had it
        },
    });
    const reportCount = await client_1.prisma.report.count({
        where: { siteId },
    });
    if ((0, verification_rules_1.shouldFlagForReview)(reportCount)) {
        // Only flag if not already flagged or verified
        const site = await client_1.prisma.site.findUnique({ where: { id: siteId } });
        if (site &&
            site.status !== client_2.VerificationStatus.FLAGGED &&
            site.status !== client_2.VerificationStatus.SUCCESS) {
            await (0, exports.verifySite)(siteId, client_2.VerificationStatus.FLAGGED, null, `System flagged due to high report count (${reportCount})`);
        }
    }
};
exports.handleReport = handleReport;
