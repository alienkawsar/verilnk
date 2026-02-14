'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { BarChart, Users, Activity } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';

interface AuditAnalytics {
    actionCounts: { action: string; _count: { action: number } }[];
    topAdmins: { adminId: string; name: string; role: string; count: number }[];
}

export default function AuditAnalyticsSection() {
    const [data, setData] = useState<AuditAnalytics | null>(null);

    useEffect(() => {
        api.get('/admin/audit/analytics')
            .then(res => setData(res.data))
            .catch(console.error);
    }, []);

    if (!data) return <Skeleton className="h-24 w-full rounded-xl" />;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Action Distribution */}
            <div className="surface-card p-6 rounded-xl shadow-sm">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-blue-500" />
                    Action Summary
                </h3>
                <div className="space-y-3">
                    {data.actionCounts.map((item) => (
                        <div key={item.action} className="flex items-center justify-between">
                            <span className="text-sm text-slate-600 dark:text-slate-400 capitalize">{item.action.toLowerCase()}</span>
                            <div className="flex items-center gap-2 w-1/2">
                                <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full flex-1 overflow-hidden">
                                    <div
                                        className="h-full bg-blue-500 rounded-full"
                                        style={{ width: `${Math.min(100, (item._count.action / 100) * 100)}%` }} // Simple scale
                                    ></div>
                                </div>
                                <span className="text-sm font-mono text-slate-900 dark:text-white w-8 text-right">{item._count.action}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Top Admins */}
            <div className="surface-card p-6 rounded-xl shadow-sm">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <Users className="w-5 h-5 text-purple-500" />
                    Top Active Admins
                </h3>
                <div className="space-y-4">
                    {data.topAdmins.map((admin, idx) => (
                        <div key={admin.adminId} className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-700 dark:text-white">
                                {idx + 1}
                            </div>
                            <div className="flex-1">
                                <div className="text-sm font-medium text-slate-900 dark:text-white">{admin.name}</div>
                                <div className="text-xs text-slate-500">{admin.role}</div>
                            </div>
                            <div className="text-sm font-bold text-slate-700 dark:text-slate-200">
                                {admin.count} <span className="text-slate-400 dark:text-slate-500 text-xs font-normal">actions</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
