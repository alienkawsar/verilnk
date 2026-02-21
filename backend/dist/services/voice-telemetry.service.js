"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVoiceTelemetrySnapshot = exports.incrementVoiceMetric = void 0;
const voiceCounters = {
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
const incrementVoiceMetric = (metric) => {
    voiceCounters[metric] += 1;
};
exports.incrementVoiceMetric = incrementVoiceMetric;
const getVoiceTelemetrySnapshot = () => ({ ...voiceCounters });
exports.getVoiceTelemetrySnapshot = getVoiceTelemetrySnapshot;
