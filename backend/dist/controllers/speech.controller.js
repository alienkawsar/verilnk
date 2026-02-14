"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSpeechProvider = exports.transcribeSpeech = exports.recognizeSpeech = void 0;
const speech_service_1 = require("../services/speech.service");
const recognizeSpeech = async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ message: 'No audio file provided.' });
            return;
        }
        // WAV is uncompressed, so files are larger than WebM.
        // 5MB ~ 1 minute of 16kHz mono (16k * 2 bytes = 32KB/s => 5MB / 32KB = 150s).
        if (req.file.size > 5 * 1024 * 1024) {
            res.status(400).json({ message: 'Audio file too large. Max 5MB.' });
            return;
        }
        const transcript = await (0, speech_service_1.transcribeAudio)(req.file.buffer);
        if (!transcript || transcript.trim().length === 0) {
            res.status(200).json({ text: '' }); // No speech detected
            return;
        }
        res.status(200).json({ text: transcript });
    }
    catch (error) {
        console.error('[SpeechController] Error:', error);
        res.status(500).json({ message: 'Failed to process speech.', error: error.message });
    }
};
exports.recognizeSpeech = recognizeSpeech;
const transcribeSpeech = async (req, res) => {
    try {
        if (!process.env.GOOGLE_CLOUD_SPEECH_API) {
            res.status(501).json({ message: 'Google Cloud Speech-to-Text not configured.' });
            return;
        }
        if (!req.file) {
            res.status(400).json({ message: 'No audio file provided.' });
            return;
        }
        const allowedTypes = ['audio/webm', 'audio/wav', 'audio/wave', 'audio/x-wav', 'audio/ogg'];
        const mimeType = req.file.mimetype || '';
        const isAllowed = allowedTypes.some(type => mimeType.startsWith(type)) || mimeType.includes('webm') || mimeType.includes('ogg');
        if (mimeType && !isAllowed) {
            res.status(400).json({ message: 'Unsupported audio format.' });
            return;
        }
        if (req.file.size > 5 * 1024 * 1024) {
            res.status(400).json({ message: 'Audio file too large. Max 5MB.' });
            return;
        }
        const result = await (0, speech_service_1.transcribeWithGoogleCloud)({
            audioBuffer: req.file.buffer,
            mimeType: mimeType || 'audio/webm'
        });
        res.status(200).json({ text: result.text, confidence: result.confidence, provider: 'googlecloud' });
    }
    catch (error) {
        console.error('[SpeechController] Google STT Error:', error);
        res.status(500).json({ message: 'Failed to process speech.', error: error.message });
    }
};
exports.transcribeSpeech = transcribeSpeech;
const getSpeechProvider = async (req, res) => {
    res.json({ googleCloud: Boolean(process.env.GOOGLE_CLOUD_SPEECH_API) });
};
exports.getSpeechProvider = getSpeechProvider;
