import { Request, Response } from 'express';
import { transcribeAudio, transcribeWithGoogleCloud } from '../services/speech.service';

export const recognizeSpeech = async (req: Request, res: Response): Promise<void> => {
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

        const transcript = await transcribeAudio(req.file.buffer);

        if (!transcript || transcript.trim().length === 0) {
            res.status(200).json({ text: '' }); // No speech detected
            return;
        }

        res.status(200).json({ text: transcript });
    } catch (error) {
        console.error('[SpeechController] Error:', error);
        res.status(500).json({ message: 'Failed to process speech.', error: (error as Error).message });
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
        res.status(500).json({ message: 'Failed to process speech.', error: (error as Error).message });
    }
};

export const getSpeechProvider = async (req: Request, res: Response): Promise<void> => {
    res.json({ googleCloud: Boolean(process.env.GOOGLE_CLOUD_SPEECH_API) });
};
