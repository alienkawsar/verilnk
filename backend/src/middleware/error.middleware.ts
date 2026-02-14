import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export const errorHandler = (
    err: any,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    console.error(err.stack);

    if (err instanceof ZodError) {
        res.status(400).json({
            message: 'Validation Error',
            errors: err.issues,
        });
        return;
    }

    if (err instanceof SyntaxError && 'body' in err) {
        res.status(400).json({ message: 'Invalid JSON payload' });
        return;
    }

    // Custom Service Errors (usually thrown as Error with message)
    if (err.message && (err.message.includes('exists') || err.message.includes('not found') || err.message.includes('required'))) {
        if (err.message.includes('not found')) {
            res.status(404).json({ message: err.message });
            return;
        }
        res.status(400).json({ message: err.message });
        return;
    }

    res.status(500).json({
        message: 'Internal Server Error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
};
