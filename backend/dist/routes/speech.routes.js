"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const speech_controller_1 = require("../controllers/speech.controller");
const rateLimit_middleware_1 = require("../middleware/rateLimit.middleware");
const router = (0, express_1.Router)();
// Store file in memory to pass buffer directly to processing pipeline
const storage = multer_1.default.memoryStorage();
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB safe limit
});
router.get('/provider', speech_controller_1.getSpeechProvider);
router.post('/recognize', rateLimit_middleware_1.voiceRateLimiter, upload.single('audio'), speech_controller_1.recognizeSpeech);
router.post('/transcribe', rateLimit_middleware_1.voiceRateLimiter, upload.single('audio'), speech_controller_1.transcribeSpeech);
exports.default = router;
