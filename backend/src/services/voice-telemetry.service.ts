export type VoiceMetric =
    | 'voice.success'
    | 'voice.no_speech'
    | 'voice.denied'
    | 'voice.invalid_audio'
    | 'voice.model_unavailable';

const voiceCounters: Record<VoiceMetric, number> = {
    'voice.success': 0,
    'voice.no_speech': 0,
    'voice.denied': 0,
    'voice.invalid_audio': 0,
    'voice.model_unavailable': 0
};

// SLO readiness signals (not enforced yet):
// - Target >=99% successful transcriptions when speech is present.
// - Target <=1% `voice.model_unavailable` across rolling windows.
// - Track and segment `voice.no_speech` to distinguish silence from failures.
export const incrementVoiceMetric = (metric: VoiceMetric) => {
    voiceCounters[metric] += 1;
};

export const getVoiceTelemetrySnapshot = () => ({ ...voiceCounters });

