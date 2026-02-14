
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { upload, uploadOrgLogo } from '../middleware/upload.middleware';
import { authenticateUser, authenticateAny } from '../middleware/auth.middleware';
import { uploadRateLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

router.post('/', authenticateUser, uploadRateLimiter, upload.single('file'), (req: Request, res: Response): void => {
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
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ message: 'File upload failed' });
    }
});

router.post('/org-logo', authenticateAny, uploadRateLimiter, uploadOrgLogo.single('file'), (req: Request, res: Response): void => {
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
    } catch (error) {
        console.error('Org logo upload error:', error);
        res.status(500).json({ message: 'File upload failed' });
    }
});

router.post('/public', uploadRateLimiter, upload.single('file'), (req: Request, res: Response): void => {
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
    } catch (error) {
        console.error('Public upload error:', error);
        res.status(500).json({ message: 'File upload failed' });
    }
});

router.post('/public/org-logo', uploadRateLimiter, uploadOrgLogo.single('file'), (req: Request, res: Response): void => {
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
    } catch (error) {
        console.error('Public org logo upload error:', error);
        res.status(500).json({ message: 'File upload failed' });
    }
});

// Multer error handler for upload routes
router.use((err: any, req: Request, res: Response, next: any) => {
    if (err instanceof multer.MulterError) {
        const message = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 1MB)' : err.message;
        return res.status(400).json({ message });
    }
    if (err?.message && /image files are allowed/i.test(err.message)) {
        return res.status(400).json({ message: err.message });
    }
    return next(err);
});

export default router;
