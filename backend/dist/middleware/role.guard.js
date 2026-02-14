"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorizeRole = void 0;
const authorizeRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            res.sendStatus(401);
            return;
        }
        if (roles.includes(req.user.role)) {
            next();
        }
        else {
            res.sendStatus(403);
        }
    };
};
exports.authorizeRole = authorizeRole;
