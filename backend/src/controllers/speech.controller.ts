import { Request, Response } from 'express';
import { isSpeechServiceError, transcribeAudio, transcribeWithGoogleCloud } from '../services/speech.service';
import { incrementVoiceMetric } from '../services/voice-telemetry.service';

const isWavBuffer = (buffer: Buffer) => {
    if (!buffer || buffer.length < 12) return false;
    const riff = buffer.subarray(0, 4).toString('ascii');
    const wave = buffer.subarray(8, 12).toString('ascii');
    return riff === 'RIFF' && wave === 'WAVE';
};

export const recognizeSpeech = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.file) {
            res.status(400).json({ message: 'No audio file provided.' });
            return;
        }

        if (process.env.NODE_ENV === 'development') {
            console.info('[SpeechController] /speech/recognize input', {
                mimetype: req.file.mimetype,
                size: req.file.size
            });
        }

        // WAV is uncompressed, so files are larger than WebM.
        // 5MB ~ 1 minute of 16kHz mono (16k * 2 bytes = 32KB/s => 5MB / 32KB = 150s).
        if (req.file.size > 5 * 1024 * 1024) {
            res.status(400).json({ message: 'Audio file too large. Max 5MB.' });
            return;
        }

        if (!isWavBuffer(req.file.buffer)) {
            incrementVoiceMetric('voice.invalid_audio');
            res.status(400).json({ error: 'INVALID_AUDIO_FORMAT' });
            return;
        }

        const transcript = await transcribeAudio(req.file.buffer);

        if (!transcript || transcript.trim().length === 0) {
            incrementVoiceMetric('voice.no_speech');
            res.status(200).json({ text: '', reason: 'NO_SPEECH' });
            return;
        }

        incrementVoiceMetric('voice.success');
        res.status(200).json({ text: transcript });
    } catch (error) {
        if (isSpeechServiceError(error)) {
            if (error.code === 'NO_AUDIO') {
                res.status(400).json({ error: 'NO_AUDIO' });
                return;
            }
            if (error.code === 'TOO_SHORT') {
                res.status(400).json({ error: 'TOO_SHORT' });
                return;
            }
            if (error.code === 'INVALID_AUDIO_FORMAT') {
                incrementVoiceMetric('voice.invalid_audio');
                res.status(400).json({ error: 'INVALID_AUDIO_FORMAT' });
                return;
            }
            if (error.code === 'NO_SPEECH_AUDIO') {
                incrementVoiceMetric('voice.no_speech');
                res.status(200).json({ text: '', reason: 'NO_SPEECH' });
                return;
            }
            if (error.code === 'MODEL_UNAVAILABLE') {
                incrementVoiceMetric('voice.model_unavailable');
                res.status(503).json({ error: 'MODEL_UNAVAILABLE' });
                return;
            }
        }

        console.error('[SpeechController] Error:', error);
        const isProduction = process.env.NODE_ENV === 'production';
        res.status(500).json(isProduction
            ? { error: 'SPEECH_PROCESSING_FAILED' }
            : { error: 'SPEECH_PROCESSING_FAILED', message: (error as Error).message });
    }
};

export const transcribeSpeech = async (req: Request, res: Response): Promise<void> => {
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

        const result = await transcribeWithGoogleCloud({
            audioBuffer: req.file.buffer,
            mimeType: mimeType || 'audio/webm'
        });

        res.status(200).json({ text: result.text, confidence: result.confidence, provider: 'googlecloud' });
    } catch (error) {
        console.error('[SpeechController] Google STT Error:', error);
        const isProduction = process.env.NODE_ENV === 'production';
        res.status(500).json(isProduction
            ? { message: 'Failed to process speech.' }
            : { message: 'Failed to process speech.', error: (error as Error).message });
    }
};

export const getSpeechProvider = async (req: Request, res: Response): Promise<void> => {
    res.json({ googleCloud: Boolean(process.env.GOOGLE_CLOUD_SPEECH_API) });
};
