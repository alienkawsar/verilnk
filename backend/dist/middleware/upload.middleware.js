"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadOrgLogo = exports.upload = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Ensure upload directories exist
const flagsDir = path_1.default.join(process.cwd(), 'uploads/flags');
const orgLogosDir = path_1.default.join(process.cwd(), 'uploads/org-logos');
if (!fs_1.default.existsSync(flagsDir)) {
    fs_1.default.mkdirSync(flagsDir, { recursive: true });
}
if (!fs_1.default.existsSync(orgLogosDir)) {
    fs_1.default.mkdirSync(orgLogosDir, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, flagsDir);
    },
    filename: (req, file, cb) => {
        // Create unique filename: timestamp + sanitized original name
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path_1.default.extname(file.originalname);
        const name = path_1.default.basename(file.originalname, ext).replace(/[^a-z0-9]/gi, '_').toLowerCase();
        cb(null, name + '-' + uniqueSuffix + ext);
    }
});
const fileFilter = (req, file, cb) => {
    // Accept images only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif|svg|webp)$/i)) {
        return cb(new Error('Only image files are allowed!'));
    }
    cb(null, true);
};
exports.upload = (0, multer_1.default)({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 1 * 1024 * 1024 // 1MB limit
    }
});
const orgLogoStorage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, orgLogosDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path_1.default.extname(file.originalname);
        const name = path_1.default.basename(file.originalname, ext).replace(/[^a-z0-9]/gi, '_').toLowerCase();
        cb(null, name + '-' + uniqueSuffix + ext);
    }
});
exports.uploadOrgLogo = (0, multer_1.default)({
    storage: orgLogoStorage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 1 * 1024 * 1024 // 1MB limit
    }
});
