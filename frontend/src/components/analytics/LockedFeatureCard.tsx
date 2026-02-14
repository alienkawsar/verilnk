'use client';

import { Lock, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

interface LockedFeatureCardProps {
    title: string;
    description?: string;
    requiredPlan: 'PRO' | 'BUSINESS';
}

export default function LockedFeatureCard({ title, description, requiredPlan }: LockedFeatureCardProps) {
    const planColors = {
        PRO: 'from-blue-500/10 to-indigo-500/10 border-blue-200 dark:border-blue-800/50',
        BUSINESS: 'from-amber-500/10 to-orange-500/10 border-amber-200 dark:border-amber-800/50'
    };

    const planLabels = {
        PRO: 'Pro',
        BUSINESS: 'Business'
    };

    return (
        <div className={`relative overflow-hidden rounded-xl border bg-gradient-to-br ${planColors[requiredPlan]} p-6`}>
            {/* Lock Icon */}
            <div className="absolute top-4 right-4">
                <Lock className="w-5 h-5 text-slate-400 dark:text-slate-500" />
            </div>

            {/* Content */}
            <div className="space-y-3">
                <h4 className="font-semibold text-slate-700 dark:text-slate-300">{title}</h4>
                {description && (
                    <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
                )}

                {/* Upgrade CTA */}
                <Link
                    href="/org/upgrade"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors group"
                >
                    Upgrade to {planLabels[requiredPlan]} to unlock
                    <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </Link>
            </div>

            {/* Decorative Elements */}
            <div className="absolute -bottom-4 -right-4 w-24 h-24 rounded-full bg-slate-200/20 dark:bg-slate-700/20 blur-xl" />
        </div>
    );
}
