import { Request, Response } from 'express';
import * as realtimeService from '../services/realtime.service';

export const streamUpdates = async (req: Request, res: Response) => {
    // SSE Headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering for Nginx/Proxies
    res.flushHeaders();

    // Register Client
    realtimeService.addClient(res);

    // Keep connection open is handled by service
};
