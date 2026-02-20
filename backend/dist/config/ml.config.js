"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mlConfig = exports.ML_LOG_LEVELS = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.ML_LOG_LEVELS = {
    SILENT: 'fatal',
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info',
    VERBOSE: 'verbose',
    DEBUG: 'debug'
};
const isDev = process.env.NODE_ENV === 'development';
exports.mlConfig = {
    // Logging
    logLevel: process.env.ML_LOG_LEVEL || (isDev ? exports.ML_LOG_LEVELS.ERROR : exports.ML_LOG_LEVELS.SILENT),
    // Performance
    numThreads: process.env.ML_THREADS ? parseInt(process.env.ML_THREADS) : 1, // Default single thread for Node event loop friendliness
    // Model Config
    modelValues: {
        task: 'automatic-speech-recognition',
        model: 'Xenova/whisper-tiny',
        quantized: true,
    },
    // Execution Provider
    executionProvider: 'cpu', // Default to CPU for broad compatibility
};
// Set Global Environment Variables for Native Libraries immediately
// '3' = ERROR, '4' = FATAL in ONNX Runtime C++ API
const nativeLogLevel = exports.mlConfig.logLevel === 'fatal' ? '4' : '3';
process.env.ORT_LOG_LEVEL = nativeLogLevel;
process.env.ONNXRUNTIME_LOG_LEVEL = nativeLogLevel;
// Optional: Suppress TFJS warnings if used
process.env.TF_CPP_MIN_LOG_LEVEL = '3';
