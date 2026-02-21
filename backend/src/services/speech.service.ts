// import { pipeline } from '@xenova/transformers';
import { WaveFile } from 'wavefile';

import { mlConfig } from '../config/ml.config';

export type SpeechServiceErrorCode =
    | 'NO_AUDIO'
    | 'TOO_SHORT'
    | 'INVALID_AUDIO_FORMAT'
    | 'NO_SPEECH_AUDIO'
    | 'MODEL_UNAVAILABLE';

export class SpeechServiceError extends Error {
    code: SpeechServiceErrorCode;

    constructor(code: SpeechServiceErrorCode, message: string) {
        super(message);
        this.code = code;
        this.name = 'SpeechServiceError';
    }
}

const createSpeechError = (code: SpeechServiceErrorCode, message: string) => {
    return new SpeechServiceError(code, message);
};

// Global transcriber state shared across requests
let transcriber: any = null;
let initPromise: Promise<void> | null = null;

const TARGET_SAMPLE_RATE = 16000;
const MIN_AUDIO_BYTES = 8 * 1024;
const MIN_DURATION_SECONDS = 0.6;
const SILENCE_RMS_THRESHOLD = 0.003;

// Initialize Model
export const initSpeechModel = async () => {
    if (transcriber) return;

    if (initPromise) {
        await initPromise;
        return;
    }

    initPromise = (async () => {
        console.log(`[SpeechService] Loading Whisper model (Level: ${mlConfig.logLevel})...`);

        // Bypass TS transpilation of dynamic import which otherwise converts to require()
        const dynamicImport = new Function('specifier', 'return import(specifier)');
        const { pipeline, env } = await dynamicImport('@xenova/transformers');

        env.backends.onnx.logLevel = mlConfig.logLevel;
        env.backends.onnx.numThreads = mlConfig.numThreads;

        transcriber = await pipeline(
            mlConfig.modelValues.task,
            mlConfig.modelValues.model,
            {
                quantized: mlConfig.modelValues.quantized,
                session_options: {
                    logSeverityLevel: 4, // 0:Verbose, 1:Info, 2:Warning, 3:Error, 4:Fatal
                    logVerbosityLevel: 4
                }
            }
        );
        console.log('[SpeechService] Whisper model loaded successfully.');
    })();

    try {
        await initPromise;
    } catch (error) {
        transcriber = null;
        console.error('[SpeechService] Failed to load Whisper model:', error);
        throw createSpeechError('MODEL_UNAVAILABLE', 'Speech model unavailable');
    } finally {
        initPromise = null;
    }
};

// Text Normalization Logic
const normalizeText = (text: string): string => {
    if (!text) return '';

    // 1. Basic Cleanup
    let normalized = text.replace(/\[unk\]/gi, '').trim();
    if (!normalized) return '';
    normalized = normalized.toLowerCase();

    // 2. Strict ISO Country Code Mapping
    normalized = normalized.replace(/\b(?:u\s?a\s?e|united arab emirates)\b/g, 'AE');
    normalized = normalized.replace(/\b(?:k\s?s\s?a|saudi(?: arabia)?)\b/g, 'SA');
    normalized = normalized.replace(/\b(?:u\s?k|u\.k\.|united kingdom|britain)\b/g, 'GB');
    normalized = normalized.replace(/\b(?:u\s?s\s?a|u\s?s|united states(?: of america)?)\b/g, 'US');
    normalized = normalized.replace(/\b(?:b\s?d|bangladesh)\b/g, 'BD');
    normalized = normalized.replace(/\b(?:india|i\s?n)\b/g, 'IN');
    normalized = normalized.replace(/\b(?:nigeria|n\s?g)\b/g, 'NG');
    normalized = normalized.replace(/\b(?:italy|i\s?t)\b/g, 'IT');

    // 3. Education Domain Mapping
    normalized = normalized.replace(/\b(?:edu)\b/g, 'education');
    normalized = normalized.replace(/\b(?:ac)\b/g, 'academic');

    // 4. General Domain Synonyms
    normalized = normalized.replace(/\b(?:gob|gove)\b/g, 'gov');
    normalized = normalized.replace(/\bgov\b/g, 'government'); // "gov" -> "government"

    // Tech corrections
    normalized = normalized.replace(/\b(?:dot\s?com)\b/g, '.com');
    normalized = normalized.replace(/\b(?:dot\s?gov)\b/g, '.gov');

    // Remove punctuation
    normalized = normalized.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");

    return normalized.replace(/\s+/g, ' ').trim();
};

const toMonoFloat32 = (samples: any): Float32Array => {
    if (Array.isArray(samples)) {
        if (!samples.length) {
            return new Float32Array();
        }

        const firstChannel = samples[0];
        if (Array.isArray(firstChannel) || ArrayBuffer.isView(firstChannel)) {
            return new Float32Array(firstChannel as ArrayLike<number>);
        }

        return new Float32Array(samples as ArrayLike<number>);
    }

    return new Float32Array(samples as ArrayLike<number>);
};

const calculateRms = (samples: Float32Array) => {
    if (!samples.length) return 0;

    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) {
        const value = samples[i];
        sumSquares += value * value;
    }

    return Math.sqrt(sumSquares / samples.length);
};

export const transcribeAudio = async (audioBuffer: Buffer): Promise<string> => {
    if (!audioBuffer || audioBuffer.length < MIN_AUDIO_BYTES) {
        throw createSpeechError('NO_AUDIO', 'Audio payload too small');
    }

    try {
        await initSpeechModel();
        if (!transcriber) {
            throw createSpeechError('MODEL_UNAVAILABLE', 'Speech model unavailable');
        }

        let wav: WaveFile;
        try {
            wav = new WaveFile(audioBuffer);
        } catch {
            throw createSpeechError('INVALID_AUDIO_FORMAT', 'Unable to parse WAV');
        }

        try {
            wav.toBitDepth('32f');
            wav.toSampleRate(TARGET_SAMPLE_RATE);
        } catch {
            throw createSpeechError('INVALID_AUDIO_FORMAT', 'Unsupported WAV format');
        }

        let rawSamples: any;
        try {
            rawSamples = wav.getSamples();
        } catch {
            throw createSpeechError('INVALID_AUDIO_FORMAT', 'Unable to decode WAV samples');
        }

        const float32Data = toMonoFloat32(rawSamples);

        if (!float32Data.length) {
            throw createSpeechError('NO_AUDIO', 'No audio samples');
        }

        const duration = float32Data.length / TARGET_SAMPLE_RATE;
        if (duration < MIN_DURATION_SECONDS) {
            throw createSpeechError('TOO_SHORT', 'Audio too short');
        }

        const rms = calculateRms(float32Data);
        if (!Number.isFinite(rms) || rms < SILENCE_RMS_THRESHOLD) {
            throw createSpeechError('NO_SPEECH_AUDIO', 'Silence-only audio');
        }

        const output = await transcriber(float32Data);
        const rawText = typeof output?.text === 'string' ? output.text : '';
        console.log(`[SpeechService] Raw Transcript: "${rawText}"`);

        const final = normalizeText(rawText);
        console.log(`[SpeechService] Final: "${final}"`);

        if (!final) {
            throw createSpeechError('NO_SPEECH_AUDIO', 'No speech recognized');
        }

        return final;

    } catch (err) {
        if (err instanceof SpeechServiceError) {
            throw err;
        }

        console.error('[SpeechService] Transcription Error:', err);
        throw err;
    }
};

export const isSpeechServiceError = (error: unknown): error is SpeechServiceError => {
    return error instanceof SpeechServiceError;
};

export const transcribeWithGoogleCloud = async (params: {
    audioBuffer: Buffer;
    mimeType: string;
}) => {
    // Production recommendation: use a service account (ADC / IAM) with the official client.
    // API key support is kept for backward compatibility and existing deployments.
    const apiKey = process.env.GOOGLE_CLOUD_SPEECH_API;
    if (!apiKey) {
        throw new Error('GOOGLE_CLOUD_SPEECH_API not configured');
    }

    const mime = (params.mimeType || '').toLowerCase();
    let encoding: 'WEBM_OPUS' | 'OGG_OPUS' | 'LINEAR16';
    let sampleRateHertz: 48000 | 16000;

    if (mime.includes('webm')) {
        encoding = 'WEBM_OPUS';
        sampleRateHertz = 48000;
    } else if (mime.includes('ogg') || mime.includes('opus')) {
        encoding = 'OGG_OPUS';
        sampleRateHertz = 48000;
    } else if (mime.includes('wav') || mime.includes('wave') || mime.includes('x-wav')) {
        encoding = 'LINEAR16';
        sampleRateHertz = 16000;
    } else {
        throw new Error('UNSUPPORTED_GOOGLE_AUDIO_FORMAT');
    }

    const languageCode = (process.env.SPEECH_LANG || 'en-US').trim() || 'en-US';
    const model = (process.env.GOOGLE_SPEECH_MODEL || 'command_and_search').trim() || 'command_and_search';

    const payload = {
        config: {
            encoding,
            languageCode,
            sampleRateHertz,
            enableAutomaticPunctuation: true,
            profanityFilter: false,
            model
        },
        audio: {
            content: params.audioBuffer.toString('base64')
        }
    };

    let response: Response;
    try {
        response = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
    } catch {
        throw new Error('GOOGLE_SPEECH_REQUEST_FAILED');
    }

    if (!response.ok) {
        throw new Error(`GOOGLE_SPEECH_API_ERROR_${response.status}`);
    }

    const data = await response.json().catch(() => null);
    if (!data || typeof data !== 'object') {
        throw new Error('GOOGLE_SPEECH_INVALID_RESPONSE');
    }

    const result = data?.results?.[0]?.alternatives?.[0];
    return {
        text: result?.transcript || '',
        confidence: result?.confidence ?? null
    };
};
