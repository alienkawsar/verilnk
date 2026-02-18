'use client';

import { CheckCircle2, XCircle } from 'lucide-react';
import {
    getPasswordChecks,
    getPasswordStrengthLabel,
    getPasswordStrengthScore
} from '@/lib/password';

type PasswordStrengthChecklistProps = {
    password: string;
    className?: string;
};

const checklistItems: Array<{ key: keyof ReturnType<typeof getPasswordChecks>; label: string }> = [
    { key: 'length', label: 'At least 8 characters' },
    { key: 'upper', label: 'Uppercase letter' },
    { key: 'lower', label: 'Lowercase letter' },
    { key: 'number', label: 'Number' },
    { key: 'special', label: 'Special character' },
];

export default function PasswordStrengthChecklist({
    password,
    className = ''
}: PasswordStrengthChecklistProps) {
    const checks = getPasswordChecks(password);
    const score = getPasswordStrengthScore(checks);
    const label = getPasswordStrengthLabel(score);
    const percent = Math.max(0, Math.min(100, (score / 5) * 100));

    const barClass = label === 'Strong'
        ? 'bg-emerald-500'
        : label === 'Medium'
            ? 'bg-amber-500'
            : 'bg-red-500';

    const labelClass = label === 'Strong'
        ? 'text-emerald-600 dark:text-emerald-400'
        : label === 'Medium'
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-red-600 dark:text-red-400';

    return (
        <div className={`space-y-2 ${className}`}>
            <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400">Password strength</span>
                <span className={`text-xs font-semibold ${labelClass}`}>{label}</span>
            </div>
            <div
                className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"
                role="progressbar"
                aria-label={`Password strength ${label}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
            >
                <div
                    className={`h-full transition-all duration-200 ${barClass}`}
                    style={{ width: `${percent}%` }}
                />
            </div>
            <ul className="space-y-1">
                {checklistItems.map((item) => {
                    const passed = checks[item.key];
                    return (
                        <li
                            key={item.key}
                            className={`flex items-center gap-2 text-xs ${
                                passed
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-red-600 dark:text-red-400'
                            }`}
                        >
                            {passed ? (
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            ) : (
                                <XCircle className="w-3.5 h-3.5 shrink-0" />
                            )}
                            <span>{item.label}</span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
