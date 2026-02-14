const NORMALIZATION_RULES: Array<{ pattern: RegExp; replace: string }> = [
    { pattern: /\b(u\s*a\s*e|u\.a\.e\.|united arab emirates)\b/gi, replace: 'uae' },
    { pattern: /\b(k\s*s\s*a|saudi(?:\s+arabia)?)\b/gi, replace: 'ksa' },
    { pattern: /\b(s\s*a)\b/gi, replace: 'sa' },
    { pattern: /\b(i\s*t|italy)\b/gi, replace: 'it' },
    { pattern: /\b(i\s*n|india)\b/gi, replace: 'in' },
    { pattern: /\b(n\s*g|nigeria)\b/gi, replace: 'ng' },
    { pattern: /\b(dot\s*e\s*d\s*u|d\s*o\s*t\s*e\s*d\s*u)\b/gi, replace: 'edu' },
    { pattern: /\b(dot\s*a\s*c|d\s*o\s*t\s*a\s*c)\b/gi, replace: 'ac' },
    { pattern: /\b(e[-\s]?commerce)\b/gi, replace: 'ecommerce' },
    { pattern: /\b(gov|government)\b/gi, replace: 'government' },
    { pattern: /\b(ministry)\b/gi, replace: 'ministry' },
    { pattern: /\b(university|college)\b/gi, replace: 'university' },
    { pattern: /\b(health|hospital)\b/gi, replace: 'health' },
    { pattern: /\b(bank|banking)\b/gi, replace: 'bank' }
];

export const normalizeVoiceTranscript = (text: string) => {
    if (!text) return '';
    let normalized = text.toLowerCase().trim();

    for (const rule of NORMALIZATION_RULES) {
        normalized = normalized.replace(rule.pattern, rule.replace);
    }

    normalized = normalized.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ' ');
    normalized = normalized.replace(/\s+/g, ' ').trim();
    return normalized;
};

