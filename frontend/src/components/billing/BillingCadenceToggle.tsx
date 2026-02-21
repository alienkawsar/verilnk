'use client';

type BillingCycle = 'monthly' | 'annual';

type BillingCadenceToggleProps = {
    value: BillingCycle;
    onChange: (value: BillingCycle) => void;
    disabled?: boolean;
    className?: string;
};

export default function BillingCadenceToggle({
    value,
    onChange,
    disabled = false,
    className = ''
}: BillingCadenceToggleProps) {
    return (
        <div className={`relative inline-flex h-10 items-center p-1 rounded-2xl bg-slate-100/85 dark:bg-slate-800/60 border border-[var(--app-border)] backdrop-blur-md shadow-sm ${className}`}>
            <div
                className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl shadow-sm transition-all duration-200 ease-out bg-white dark:bg-slate-700/80 border border-slate-200/70 dark:border-slate-600/70 ${value === 'monthly' ? 'left-1' : 'left-[50%]'
                    }`}
            />

            <button
                type="button"
                onClick={() => onChange('monthly')}
                disabled={disabled}
                className={`relative z-10 h-8 w-[134px] px-3 text-sm font-semibold transition-colors duration-200 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#187DE9]/45 disabled:cursor-not-allowed disabled:opacity-60 ${value === 'monthly'
                    ? 'text-slate-900 dark:text-[#EAF0FF]'
                    : 'text-slate-500 dark:text-white/60 hover:text-slate-700 dark:hover:text-white/80'
                    }`}
            >
                Monthly
            </button>
            <button
                type="button"
                onClick={() => onChange('annual')}
                disabled={disabled}
                className={`relative z-10 h-8 w-[134px] px-3 text-sm font-semibold transition-colors duration-200 rounded-xl flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#187DE9]/45 disabled:cursor-not-allowed disabled:opacity-60 ${value === 'annual'
                    ? 'text-slate-900 dark:text-[#EAF0FF]'
                    : 'text-slate-500 dark:text-white/60 hover:text-slate-700 dark:hover:text-white/80'
                    }`}
            >
                Annual
                {value === 'annual' && (
                    <span className="bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-400/20 text-[10px] px-1.5 py-0.5 rounded-lg font-bold leading-none animate-in fade-in zoom-in duration-200">
                        -10%
                    </span>
                )}
            </button>
        </div>
    );
}
