'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
}

export function PasswordInput({ className = '', label, ...props }: PasswordInputProps) {
    const [showPassword, setShowPassword] = useState(false);

    const toggleVisibility = () => {
        setShowPassword(!showPassword);
    };

    return (
        <div>
            {label && (
                <label className="block text-sm font-medium text-[var(--app-text-secondary)] mb-2">
                    {label}
                </label>
            )}
            <div className="relative">
                <input
                    type={showPassword ? 'text' : 'password'}
                    className={`w-full px-4 py-3 bg-transparent border border-slate-200 dark:border-slate-700 rounded-lg text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500 transition-colors pr-12 ${className}`}
                    {...props}
                />
                <button
                    type="button"
                    onClick={toggleVisibility}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-500 transition-colors p-1"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                    {showPassword ? (
                        <EyeOff className="w-5 h-5" />
                    ) : (
                        <Eye className="w-5 h-5" />
                    )}
                </button>
            </div>
        </div>
    );
}
