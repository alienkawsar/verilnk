"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyCaptcha = void 0;
const axios_1 = __importDefault(require("axios"));
const verifyCaptcha = async (token, expectedAction) => {
    if (!token)
        return false;
    // Skip verification in development if explicitly allowed or no secret provided (optional safety)
    if (process.env.NODE_ENV === 'development' && !process.env.RECAPTCHA_SECRET_KEY) {
        console.warn('ReCAPTCHA skipped: No Secret Key in Dev');
        return true;
    }
    try {
        const secret = process.env.RECAPTCHA_SECRET_KEY;
        if (!secret) {
            console.error('ReCAPTCHA Verification Error: Missing Secret Key');
            return false;
        }
        if (process.env.NODE_ENV !== 'production') {
            console.info('ReCAPTCHA debug', {
                tokenPresent: Boolean(token),
                secretPresent: Boolean(secret)
            });
        }
        const params = new URLSearchParams();
        params.append('secret', secret);
        params.append('response', token);
        const response = await axios_1.default.post('https://www.google.com/recaptcha/api/siteverify', params.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        const { success } = response.data;
        const score = response.data?.score;
        const action = response.data?.action;
        const minScore = Number.parseFloat(process.env.RECAPTCHA_MIN_SCORE || '0.5');
        if (process.env.NODE_ENV !== 'production') {
            console.info('ReCAPTCHA response', {
                success,
                errorCodes: response.data?.['error-codes'],
                score,
                action
            });
        }
        if (!success) {
            const errorCodes = response.data?.['error-codes'];
            console.warn('ReCAPTCHA verification failed', { errorCodes });
            return false;
        }
        if (expectedAction && action !== expectedAction) {
            console.warn('ReCAPTCHA action mismatch', { expectedAction, action });
            return false;
        }
        if (typeof score !== 'number') {
            console.warn('ReCAPTCHA score missing', { score });
            return false;
        }
        if (score < minScore) {
            console.warn('ReCAPTCHA score too low', { score, minScore });
            return false;
        }
        return success;
    }
    catch (error) {
        console.error('ReCAPTCHA Verification Failed:', error);
        return false;
    }
};
exports.verifyCaptcha = verifyCaptcha;
