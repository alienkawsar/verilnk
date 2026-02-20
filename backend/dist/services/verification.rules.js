"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldFlagForReview = exports.isTrustedDomain = exports.REPORT_THRESHOLD = exports.trustedSuffixes = void 0;
exports.trustedSuffixes = ['.gov', '.edu'];
exports.REPORT_THRESHOLD = 5;
const isTrustedDomain = (url) => {
    try {
        const hostname = new URL(url).hostname;
        return exports.trustedSuffixes.some((suffix) => hostname.endsWith(suffix));
    }
    catch {
        return false;
    }
};
exports.isTrustedDomain = isTrustedDomain;
const shouldFlagForReview = (reportCount) => {
    return reportCount >= exports.REPORT_THRESHOLD;
};
exports.shouldFlagForReview = shouldFlagForReview;
