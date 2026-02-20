"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateStrongPassword = exports.assertStrongPassword = exports.isStrongPassword = exports.STRONG_PASSWORD_MESSAGE = exports.STRONG_PASSWORD_REGEX = void 0;
exports.STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
exports.STRONG_PASSWORD_MESSAGE = 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.';
const isStrongPassword = (password) => {
    return exports.STRONG_PASSWORD_REGEX.test(password);
};
exports.isStrongPassword = isStrongPassword;
const assertStrongPassword = (password) => {
    if (!(0, exports.isStrongPassword)(password)) {
        throw new Error(exports.STRONG_PASSWORD_MESSAGE);
    }
};
exports.assertStrongPassword = assertStrongPassword;
const generateStrongPassword = () => {
    // Ensures all required character classes are present.
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const digits = '0123456789';
    const special = '!@#$%^&*()-_=+[]{};:,.?/|~';
    const all = upper + lower + digits + special;
    const pick = (pool) => pool[Math.floor(Math.random() * pool.length)];
    const base = [pick(upper), pick(lower), pick(digits), pick(special)];
    while (base.length < 12) {
        base.push(pick(all));
    }
    // Shuffle
    for (let i = base.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [base[i], base[j]] = [base[j], base[i]];
    }
    return base.join('');
};
exports.generateStrongPassword = generateStrongPassword;
