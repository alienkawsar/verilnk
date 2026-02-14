"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const upload_middleware_1 = require("../middleware/upload.middleware");
const auth_middleware_1 = require("../middleware/auth.middleware");
const rateLimit_middleware_1 = require("../middleware/rateLimit.middleware");
const router = (0, express_1.Router)();
router.post('/', auth_middleware_1.authenticateUser, rateLimit_middleware_1.uploadRateLimiter, upload_middleware_1.upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ message: 'No file uploaded' });
            return;
        }
        // Return the accessible URL
        // Currently hardcoding /uploads/flags/ but this depends on static serve config
        const fileUrl = `${process.env.BACKEND_URL || 'http://localhost:8000'}/uploads/flags/${req.file.filename}`;
        res.json({
            message: 'File uploaded successfully',
            url: fileUrl,
            filename: req.file.filename
        });
    }
    catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ message: 'File upload failed' });
    }
});
router.post('/org-logo', auth_middleware_1.authenticateAny, rateLimit_middleware_1.uploadRateLimiter, upload_middleware_1.uploadOrgLogo.single('file'), (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ message: 'No file uploaded' });
            return;
        }
        const fileUrl = `${process.env.BACKEND_URL || 'http://localhost:8000'}/uploads/org-logos/${req.file.filename}`;
        res.json({
            message: 'File uploaded successfully',
            url: fileUrl,
            filename: req.file.filename
        });
    }
    catch (error) {
        console.error('Org logo upload error:', error);
        res.status(500).json({ message: 'File upload failed' });
    }
});
router.post('/public', rateLimit_middleware_1.uploadRateLimiter, upload_middleware_1.upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ message: 'No file uploaded' });
            return;
        }
        const fileUrl = `${process.env.BACKEND_URL || 'http://localhost:8000'}/uploads/flags/${req.file.filename}`;
        res.json({
            message: 'File uploaded successfully',
            url: fileUrl,
            filename: req.file.filename
        });
    }
    catch (error) {
        console.error('Public upload error:', error);
        res.status(500).json({ message: 'File upload failed' });
    }
});
router.post('/public/org-logo', rateLimit_middleware_1.uploadRateLimiter, upload_middleware_1.uploadOrgLogo.single('file'), (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ message: 'No file uploaded' });
            return;
        }
        const fileUrl = `${process.env.BACKEND_URL || 'http://localhost:8000'}/uploads/org-logos/${req.file.filename}`;
        res.json({
            message: 'File uploaded successfully',
            url: fileUrl,
            filename: req.file.filename
        });
    }
    catch (error) {
        console.error('Public org logo upload error:', error);
        res.status(500).json({ message: 'File upload failed' });
    }
});
// Multer error handler for upload routes
router.use((err, req, res, next) => {
    if (err instanceof multer_1.default.MulterError) {
        const message = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 1MB)' : err.message;
        return res.status(400).json({ message });
    }
    if (err?.message && /image files are allowed/i.test(err.message)) {
        return res.status(400).json({ message: err.message });
    }
    return next(err);
});
exports.default = router;
