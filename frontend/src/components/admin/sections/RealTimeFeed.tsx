'use client';

import { useState, useEffect, useRef } from 'react';
import { Activity, Pause, Play, Terminal } from 'lucide-react';

interface RealTimeLog {
    id: string;
    action: string;
    entity: string;
    details: string;
    createdAt: string;
    adminId: string;
    adminName?: string; // Optional if enriched
}

interface RealTimeFeedProps {
    onLogReceived?: () => void;
}

export default function RealTimeFeed({ onLogReceived }: RealTimeFeedProps) {
    const [logs, setLogs] = useState<RealTimeLog[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const eventSourceRef = useRef<EventSource | null>(null);

    useEffect(() => {
        // Connect to SSE
        const token = document.cookie.split('; ').find(row => row.startsWith('admin_token='))?.split('=')[1];

        // Native EventSource doesn't support headers, so we used a cookie based auth which backend middleware checks.
        // OR we can use event-source-polyfill if we need headers.
        // Assuming cookie auth works since we set httpOnly cookie on login.

        const connect = () => {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
            const es = new EventSource(`${API_URL}/realtime/stream`, { withCredentials: true });

            es.onopen = () => {
                setIsConnected(true);
                // console.log('SSE Connected');
            };

            es.onmessage = (event) => {
                if (isPaused) return;
                try {
                    const payload = JSON.parse(event.data);
                    if (payload.type === 'LOG') {
                        setLogs(prev => [payload.data, ...prev].slice(0, 50)); // Keep last 50
                        if (onLogReceived) onLogReceived();
                    }
                } catch (e) {
                    console.error('SSE Parse Error', e);
                }
            };

            es.onerror = (e) => {
                // console.log('SSE Error', e);
                setIsConnected(false);
                es.close();
                // Auto-reconnect handled by browser usually, but for custom logic:
                setTimeout(connect, 5000);
            };

            eventSourceRef.current = es;
        };

        if (!eventSourceRef.current) {
            connect();
        }

        return () => {
            eventSourceRef.current?.close();
            eventSourceRef.current = null;
        };
    }, [isPaused]);

    const togglePause = () => setIsPaused(!isPaused);

    return (
        <div className="surface-card rounded-xl overflow-hidden flex flex-col h-[400px]">
            <div className="p-4 border-b border-[var(--app-border)] flex justify-between items-center bg-transparent backdrop-blur">
                <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-emerald-600 dark:text-emerald-500" />
                    <h3 className="font-bold text-slate-900 dark:text-white text-sm">Live Admin Activity</h3>
                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
                </div>
                <button
                    onClick={togglePause}
                    className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                    title={isPaused ? "Resume Feed" : "Pause Feed"}
                >
                    {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700">
                {logs.length === 0 ? (
                    <div className="text-slate-400 dark:text-slate-600 text-center mt-10 italic">Waiting for activity...</div>
                ) : (
                    logs.map((log) => (
                        <div key={log.id} className="flex gap-3 text-slate-700 dark:text-slate-300 animate-in fade-in slide-in-from-top-2 duration-300">
                            <span className="text-slate-400 dark:text-slate-600 shrink-0">
                                {new Date(log.createdAt).toLocaleTimeString()}
                            </span>
                            <span className={`font-bold shrink-0 ${log.action === 'DELETE' ? 'text-red-500 dark:text-red-400' :
                                log.action === 'CREATE' ? 'text-blue-600 dark:text-blue-400' : 'text-emerald-600 dark:text-emerald-400'
                                }`}>
                                [{log.action}]
                            </span>
                            <span className="truncate">
                                <span className="text-slate-500">{log.entity}:</span> {log.details}
                            </span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
