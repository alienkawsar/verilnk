export type VoiceInputMode = 'native' | 'fallback' | 'unsupported';

export type NativeFallbackReason =
    | 'network'
    | 'service-not-allowed'
    | 'audio-capture'
    | 'start-failed'
    | 'empty'
    | 'no-speech'
    | string;

const DIRECT_FALLBACK_REASONS = new Set<NativeFallbackReason>([
    'network',
    'service-not-allowed',
    'audio-capture'
]);

const INSTABILITY_FALLBACK_REASONS = new Set<NativeFallbackReason>([
    'start-failed',
    'empty'
]);

export const NATIVE_INSTABILITY_THRESHOLD = 2;

export const shouldSwitchToFallback = (params: {
    reason: NativeFallbackReason;
    instabilityCount: number;
}) => {
    if (params.reason === 'no-speech') return false;
    if (DIRECT_FALLBACK_REASONS.has(params.reason)) return true;
    if (INSTABILITY_FALLBACK_REASONS.has(params.reason)) {
        return params.instabilityCount >= NATIVE_INSTABILITY_THRESHOLD;
    }
    return false;
};

export const resolveVoiceInputMode = (params: {
    nativeSupported: boolean;
    nativeUnstable: boolean;
    fallbackSupported: boolean;
}): VoiceInputMode => {
    // User interaction should always re-run this decision tree.
    if (params.nativeSupported && !params.nativeUnstable) return 'native';
    if (params.fallbackSupported) return 'fallback';
    if (params.nativeSupported) return 'native';
    return 'unsupported';
};
