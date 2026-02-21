export type VoiceMetric =
    | 'voice.success'
    | 'voice.no_speech'
    | 'voice.denied'
    | 'voice.invalid_audio'
    | 'voice.model_unavailable'
    | 'voice.suspected_false_no_speech';

export type VoiceOutcome = 'success' | 'no_speech' | 'denied' | 'error';
export type VoiceProvider = 'webspeech' | 'wasm' | 'googlecloud';
export type BrowserFamily = 'chromium' | 'firefox' | 'safari' | 'unknown';
export type PlatformFamily = 'windows' | 'linux' | 'macos' | 'unknown';

export type VoiceOutcomeEvent = {
    provider: VoiceProvider;
    outcome: VoiceOutcome;
    energyDetected: boolean;
    spokenDetected: boolean;
    durationMs: number;
    browserFamily: BrowserFamily;
    platform: PlatformFamily;
    timestampMs: number;
};

const counters: Record<VoiceMetric, number> = {
    'voice.success': 0,
    'voice.no_speech': 0,
    'voice.denied': 0,
    'voice.invalid_audio': 0,
    'voice.model_unavailable': 0,
    'voice.suspected_false_no_speech': 0
};

export const incrementVoiceMetric = (metric: VoiceMetric) => {
    counters[metric] += 1;

    if (process.env.NODE_ENV === 'development') {
        console.info('[voice/telemetry]', metric, counters[metric]);
    }
};

export const getVoiceMetricsSnapshot = () => ({ ...counters });

const outcomeEvents: VoiceOutcomeEvent[] = [];
const MAX_OUTCOME_EVENTS = 100;

const detectBrowserFamily = (): BrowserFamily => {
    if (typeof navigator === 'undefined') return 'unknown';
    const ua = navigator.userAgent.toLowerCase();

    if (ua.includes('firefox')) return 'firefox';
    if (ua.includes('edg') || ua.includes('chrome') || ua.includes('chromium')) return 'chromium';
    if (ua.includes('safari')) return 'safari';
    return 'unknown';
};

const detectPlatform = (): PlatformFamily => {
    if (typeof navigator === 'undefined') return 'unknown';
    const platform = `${navigator.platform || ''} ${navigator.userAgent || ''}`.toLowerCase();

    if (platform.includes('win')) return 'windows';
    if (platform.includes('linux') || platform.includes('x11')) return 'linux';
    if (platform.includes('mac') || platform.includes('darwin')) return 'macos';
    return 'unknown';
};

// SLO note (measurement only):
// suspected_false_no_speech_rate = suspected_false_no_speech / all_voice_sessions
// Target: suspected_false_no_speech_rate < 1%
export const recordVoiceOutcome = (event: Omit<VoiceOutcomeEvent, 'browserFamily' | 'platform' | 'timestampMs'>) => {
    const enriched: VoiceOutcomeEvent = {
        ...event,
        durationMs: Math.max(0, Math.round(event.durationMs || 0)),
        browserFamily: detectBrowserFamily(),
        platform: detectPlatform(),
        timestampMs: Date.now()
    };

    outcomeEvents.push(enriched);
    if (outcomeEvents.length > MAX_OUTCOME_EVENTS) {
        outcomeEvents.shift();
    }

    if (enriched.outcome === 'no_speech' && enriched.energyDetected) {
        incrementVoiceMetric('voice.suspected_false_no_speech');
    }

    if (process.env.NODE_ENV === 'development') {
        console.info('[voice/outcome]', enriched);
    }

    return enriched;
};

export const getVoiceOutcomeEvents = () => [...outcomeEvents];
