"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transcribeWithGoogleCloud = exports.transcribeAudio = exports.initSpeechModel = void 0;
// import { pipeline } from '@xenova/transformers';
const wavefile_1 = require("wavefile");
const ml_config_1 = require("../config/ml.config");
// Global Transcriber Instance
let transcriber = null;
// Initialize Model
const initSpeechModel = async () => {
    if (transcriber)
        return;
    try {
        console.log(`[SpeechService] Loading Whisper model (Level: ${ml_config_1.mlConfig.logLevel})...`);
        // Bypass TS transpilation of dynamic import which otherwise converts to require()
        const dynamicImport = new Function('specifier', 'return import(specifier)');
        const { pipeline, env } = await dynamicImport('@xenova/transformers');
        // Apply Configuration
        env.backends.onnx.logLevel = ml_config_1.mlConfig.logLevel;
        env.backends.onnx.numThreads = ml_config_1.mlConfig.numThreads;
        // Use 'quantized' version by default for speed (Xenova/whisper-tiny)
        transcriber = await pipeline(ml_config_1.mlConfig.modelValues.task, ml_config_1.mlConfig.modelValues.model, {
            quantized: ml_config_1.mlConfig.modelValues.quantized,
            // Explicitly set session options for ONNX Runtime
            session_options: {
                logSeverityLevel: 4, // 0:Verbose, 1:Info, 2:Warning, 3:Error, 4:Fatal
                logVerbosityLevel: 4
            }
        });
        console.log('[SpeechService] Whisper model loaded successfully.');
    }
    catch (error) {
        console.error('[SpeechService] Failed to load Whisper model:', error);
    }
};
exports.initSpeechModel = initSpeechModel;
// Text Normalization Logic
const normalizeText = (text) => {
    if (!text)
        return '';
    // 1. Basic Cleanup
    let normalized = text.replace(/\[unk\]/gi, '').trim();
    if (!normalized)
        return '';
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
const transcribeAudio = async (audioBuffer) => {
    if (!transcriber)
        await (0, exports.initSpeechModel)();
    if (!transcriber)
        throw new Error('Speech model not initialized');
    try {
        // Parse WAV using wavefile
        const wav = new wavefile_1.WaveFile(audioBuffer);
        // Ensure format is Float32, 16kHz, Mono for Whisper
        wav.toBitDepth('32f');
        wav.toSampleRate(16000);
        // Use 'any' to bypass strict WaveFile type definitions that might conflict
        // in different environments, then explicitly cast to Float32Array.
        let audioData = wav.getSamples();
        // Handle Multi-channel (Convert to Mono if needed, or just take first channel)
        if (Array.isArray(audioData)) {
            // Check if it's an array of arrays (multi-channel)
            // or an array of TypedArrays
            if (audioData.length > 0 && (Array.isArray(audioData[0]) || audioData[0] instanceof Float32Array || audioData[0] instanceof Float64Array)) {
                // Taking first channel
                audioData = audioData[0];
            }
        }
        // Ensure it is a Float32Array for Whisper
        // This handles copying from Float64Array or generic Array
        const float32Data = new Float32Array(audioData);
        // Run Inference
        // The pipeline expects: Float32Array of audio samples (16kHz SC)
        const output = await transcriber(float32Data);
        // output can be { text: string }
        const rawText = output.text || '';
        console.log(`[SpeechService] Raw Transcript: "${rawText}"`);
        const final = normalizeText(rawText);
        console.log(`[SpeechService] Final: "${final}"`);
        return final;
    }
    catch (err) {
        console.error('[SpeechService] Transcription Error:', err);
        throw err;
    }
};
exports.transcribeAudio = transcribeAudio;
const transcribeWithGoogleCloud = async (params) => {
    const apiKey = process.env.GOOGLE_CLOUD_SPEECH_API;
    if (!apiKey) {
        throw new Error('GOOGLE_CLOUD_SPEECH_API not configured');
    }
    const mime = params.mimeType.toLowerCase();
    let encoding = 'LINEAR16';
    let sampleRateHertz = 16000;
    if (mime.includes('webm') || mime.includes('opus')) {
        encoding = 'WEBM_OPUS';
        sampleRateHertz = 48000;
    }
    else if (mime.includes('ogg')) {
        encoding = 'OGG_OPUS';
        sampleRateHertz = 48000;
    }
    else if (mime.includes('wav') || mime.includes('wave') || mime.includes('x-wav')) {
        encoding = 'LINEAR16';
        sampleRateHertz = 16000;
    }
    const payload = {
        config: {
            encoding,
            languageCode: 'en-US',
            sampleRateHertz
        },
        audio: {
            content: params.audioBuffer.toString('base64')
        }
    };
    const response = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google Speech API error: ${response.status} ${errorText}`);
    }
    const data = await response.json();
    const result = data?.results?.[0]?.alternatives?.[0];
    return {
        text: result?.transcript || '',
        confidence: result?.confidence ?? null
    };
};
exports.transcribeWithGoogleCloud = transcribeWithGoogleCloud;
