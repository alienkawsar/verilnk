import dotenv from 'dotenv';
dotenv.config();

export const ML_LOG_LEVELS = {
    SILENT: 'fatal',
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info',
    VERBOSE: 'verbose',
    DEBUG: 'debug'
};

const isDev = process.env.NODE_ENV === 'development';

export const mlConfig = {
    // Logging
    logLevel: process.env.ML_LOG_LEVEL || (isDev ? ML_LOG_LEVELS.ERROR : ML_LOG_LEVELS.SILENT),

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
const nativeLogLevel = mlConfig.logLevel === 'fatal' ? '4' : '3';

process.env.ORT_LOG_LEVEL = nativeLogLevel;
process.env.ONNXRUNTIME_LOG_LEVEL = nativeLogLevel;

// Optional: Suppress TFJS warnings if used
process.env.TF_CPP_MIN_LOG_LEVEL = '3';
