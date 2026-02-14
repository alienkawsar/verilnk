"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getJobStatus = exports.uploadImport = void 0;
const client_1 = require("../db/client");
const bulk_import_service_1 = require("../services/bulk-import.service");
const client_2 = require("@prisma/client");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const uploadImport = async (req, res) => {
    try {
        // Strict Super Admin Check
        const user = req.user;
        if (!user || user.role !== client_2.AdminRole.SUPER_ADMIN) {
            if (req.file)
                fs_1.default.unlinkSync(req.file.path);
            res.status(403).json({ message: 'Access denied. Super Admin only.' });
            return;
        }
        if (!req.file) {
            res.status(400).json({ message: 'No file uploaded' });
            return;
        }
        const { strictMode, dryRun } = req.body;
        const isStrict = strictMode === 'true';
        const isDryRun = dryRun === 'true';
        // Validate File Type
        const ext = path_1.default.extname(req.file.originalname).toLowerCase();
        if (ext !== '.csv' && ext !== '.json') {
            fs_1.default.unlinkSync(req.file.path);
            res.status(400).json({ message: 'Invalid file format. Only .csv and .json allowed.' });
            return;
        }
        // Create Job Record
        const job = await client_1.prisma.bulkImportJob.create({
            data: {
                adminId: user.id,
                fileName: req.file.originalname,
                fileSize: req.file.size,
                status: 'PENDING'
            }
        });
        const fileType = ext === '.csv' ? 'csv' : 'json';
        // Trigger Background Process (fire and forget)
        (0, bulk_import_service_1.processImportJob)(job.id, req.file.path, fileType, isStrict, isDryRun);
        res.status(202).json({
            message: 'Import job started',
            jobId: job.id
        });
    }
    catch (error) {
        if (req.file && fs_1.default.existsSync(req.file.path)) {
            fs_1.default.unlinkSync(req.file.path);
        }
        console.error('Import Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.uploadImport = uploadImport;
const getJobStatus = async (req, res) => {
    try {
        const user = req.user;
        if (!user || user.role !== client_2.AdminRole.SUPER_ADMIN) {
            res.status(403).json({ message: 'Access denied.' });
            return;
        }
        const { id } = req.params;
        const job = await client_1.prisma.bulkImportJob.findUnique({ where: { id: id } });
        if (!job) {
            res.status(404).json({ message: 'Job not found' });
            return;
        }
        res.json(job);
    }
    catch (error) {
        console.error('Get Status Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.getJobStatus = getJobStatus;
