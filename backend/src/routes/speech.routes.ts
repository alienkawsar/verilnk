import { Router } from 'express';
import multer from 'multer';
import { recognizeSpeech, transcribeSpeech, getSpeechProvider } from '../controllers/speech.controller';
import { voiceRateLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

// Store file in memory to pass buffer directly to processing pipeline
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB safe limit
});

router.get('/provider', getSpeechProvider);
router.post('/recognize', voiceRateLimiter, upload.single('audio'), recognizeSpeech);
router.post('/transcribe', voiceRateLimiter, upload.single('audio'), transcribeSpeech);

export default router;
