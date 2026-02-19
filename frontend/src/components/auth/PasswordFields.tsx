'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, XCircle } from 'lucide-react';
import {
    checkPasswordCriteria,
    getPasswordStrength,
    validatePassword,
} from '@/lib/passwordPolicy';

const defaultInputClass =
    'w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm';

const defaultLabelClass = 'text-sm font-medium text-slate-700 dark:text-slate-300';

const checklistItems: Array<{
    key: keyof ReturnType<typeof checkPasswordCriteria>;
    label: string;
}> = [
    { key: 'minLen', label: '8+ chars' },
    { key: 'lower', label: 'lower' },
    { key: 'upper', label: 'UPPER' },
    { key: 'number', label: '123' },
    { key: 'special', label: '@#$' },
];

interface PasswordFieldsProps {
    password: string;
    setPassword: (value: string) => void;
    confirmPassword: string;
    setConfirmPassword: (value: string) => void;
    showConfirm?: boolean;
    labelPassword?: string;
    labelConfirm?: string;
    passwordPlaceholder?: string;
    confirmPlaceholder?: string;
    disabled?: boolean;
    required?: boolean;
    className?: string;
    inputClassName?: string;
    labelClassName?: string;
    passwordError?: string;
    confirmError?: string;
    onValidityChange?: (valid: boolean) => void;
}

export default function PasswordFields({
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    showConfirm = true,
    labelPassword = 'Password',
    labelConfirm = 'Confirm Password',
    passwordPlaceholder,
    confirmPlaceholder,
    disabled = false,
    required = true,
    className = '',
    inputClassName = defaultInputClass,
    labelClassName = defaultLabelClass,
    passwordError,
    confirmError,
    onValidityChange,
}: PasswordFieldsProps) {
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const criteria = useMemo(() => checkPasswordCriteria(password), [password]);
    const strength = useMemo(() => getPasswordStrength(password), [password]);
    const validation = useMemo(() => validatePassword(password), [password]);

    const shouldValidate = required || Boolean(password);
    const confirmPresent = !showConfirm || Boolean(confirmPassword);
    const passwordsMatch = !showConfirm || password === confirmPassword;
    const isValid = shouldValidate
        ? validation.ok && (!showConfirm || (confirmPresent && passwordsMatch))
        : true;

    useEffect(() => {
        if (onValidityChange) {
            onValidityChange(isValid);
        }
    }, [isValid, onValidityChange]);

    const showInlineStrength = shouldValidate;
    const showMismatch = showConfirm && !confirmError && Boolean(confirmPassword) && !passwordsMatch;

    const labelClass =
        strength.label === 'Strong'
            ? 'text-emerald-600 dark:text-emerald-400'
            : strength.label === 'Good'
              ? 'text-blue-600 dark:text-blue-400'
              : strength.label === 'Fair'
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-red-600 dark:text-red-400';

    const strengthSegmentClass = (segment: number) => {
        if (segment > strength.score) {
            return 'bg-slate-200 dark:bg-slate-700';
        }
        if (strength.label === 'Strong') {
            return 'bg-emerald-500';
        }
        if (strength.label === 'Good') {
            return 'bg-blue-500';
        }
        if (strength.label === 'Fair') {
            return 'bg-amber-500';
        }
        return 'bg-red-500';
    };

    return (
        <div className={`space-y-3 ${className}`}>
            <div className="space-y-1.5">
                <label className={labelClassName}>{labelPassword}</label>
                <div className="relative">
                    <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder={passwordPlaceholder}
                        disabled={disabled}
                        className={`${inputClassName} pr-11`}
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword((previous) => !previous)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        disabled={disabled}
                    >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                </div>
                {passwordError ? <p className="text-xs text-red-500 dark:text-red-400">{passwordError}</p> : null}
            </div>

            {showConfirm ? (
                <div className="space-y-1.5">
                    <label className={labelClassName}>{labelConfirm}</label>
                    <div className="relative">
                        <input
                            type={showConfirmPassword ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            placeholder={confirmPlaceholder}
                            disabled={disabled}
                            className={`${inputClassName} pr-11`}
                        />
                        <button
                            type="button"
                            onClick={() => setShowConfirmPassword((previous) => !previous)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                            aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                            disabled={disabled}
                        >
                            {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                    {confirmError ? (
                        <p className="text-xs text-red-500 dark:text-red-400">{confirmError}</p>
                    ) : null}
                    {showMismatch ? (
                        <p className="text-xs text-red-500 dark:text-red-400">Passwords do not match</p>
                    ) : null}
                </div>
            ) : null}

            {showInlineStrength ? (
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500 dark:text-slate-400">Password strength</span>
                        <span className={`text-xs font-semibold ${labelClass}`}>{strength.label}</span>
                    </div>
                    <div
                        role="progressbar"
                        aria-label={`Password strength ${strength.label}`}
                        aria-valuemin={0}
                        aria-valuemax={4}
                        aria-valuenow={strength.score}
                        className="grid grid-cols-4 gap-1"
                    >
                        {[1, 2, 3, 4].map((segment) => (
                            <div
                                key={segment}
                                className={`h-1.5 rounded-full transition-colors duration-200 ${strengthSegmentClass(segment)}`}
                            />
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {checklistItems.map((item) => {
                            const passed = criteria[item.key];
                            return (
                                <span
                                    key={item.key}
                                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                                        passed
                                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                            : 'border-red-500/35 bg-red-500/10 text-red-700 dark:text-red-300'
                                    }`}
                                >
                                    {passed ? (
                                        <CheckCircle2 className="w-3 h-3" />
                                    ) : (
                                        <XCircle className="w-3 h-3" />
                                    )}
                                    {item.label}
                                </span>
                            );
                        })}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
