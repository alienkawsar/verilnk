export const trustedSuffixes = ['.gov', '.edu'];
export const REPORT_THRESHOLD = 5;

export const isTrustedDomain = (url: string): boolean => {
    try {
        const hostname = new URL(url).hostname;
        return trustedSuffixes.some((suffix) => hostname.endsWith(suffix));
    } catch {
        return false;
    }
};

export const shouldFlagForReview = (reportCount: number): boolean => {
    return reportCount >= REPORT_THRESHOLD;
};
