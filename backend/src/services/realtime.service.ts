import { Response } from 'express';

interface Client {
    id: number;
    res: Response;
}

let clients: Client[] = [];
let nextClientId = 1;

export const addClient = (res: Response) => {
    const clientId = nextClientId++;
    const client: Client = { id: clientId, res };
    clients.push(client);

    console.log(`[RealTime] Client ${clientId} connected. Total: ${clients.length}`);

    // Remove client on close
    res.on('close', () => {
        console.log(`[RealTime] Client ${clientId} disconnected.`);
        clients = clients.filter(c => c.id !== clientId);
    });

    // Send initial connection message or heartbeat
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', message: 'Stream connected' })}\n\n`);

    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
        res.write(':\n\n'); // Comment line as keep-alive
    }, 30000);

    res.on('close', () => {
        clearInterval(heartbeat);
    });
};

export const broadcast = (event: string, data: any) => {
    if (clients.length === 0) return;

    const payload = JSON.stringify({ type: event, data });
    clients.forEach(client => {
        try {
            client.res.write(`data: ${payload}\n\n`);
        } catch (error) {
            console.error(`[RealTime] Failed to send to client ${client.id}`, error);
        }
    });
};
