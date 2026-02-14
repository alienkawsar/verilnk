
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Ensure upload directories exist
const flagsDir = path.join(process.cwd(), 'uploads/flags');
const orgLogosDir = path.join(process.cwd(), 'uploads/org-logos');
if (!fs.existsSync(flagsDir)) {
    fs.mkdirSync(flagsDir, { recursive: true });
}
if (!fs.existsSync(orgLogosDir)) {
    fs.mkdirSync(orgLogosDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, flagsDir);
    },
    filename: (req, file, cb) => {
        // Create unique filename: timestamp + sanitized original name
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const name = path.basename(file.originalname, ext).replace(/[^a-z0-9]/gi, '_').toLowerCase();
        cb(null, name + '-' + uniqueSuffix + ext);
    }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    // Accept images only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif|svg|webp)$/i)) {
        return cb(new Error('Only image files are allowed!'));
    }
    cb(null, true);
};

export const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 1 * 1024 * 1024 // 1MB limit
    }
});

const orgLogoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, orgLogosDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const name = path.basename(file.originalname, ext).replace(/[^a-z0-9]/gi, '_').toLowerCase();
        cb(null, name + '-' + uniqueSuffix + ext);
    }
});

export const uploadOrgLogo = multer({
    storage: orgLogoStorage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 1 * 1024 * 1024 // 1MB limit
    }
});
