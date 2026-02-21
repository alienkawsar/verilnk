'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, CreditCard, Lock, Loader2, ShieldCheck, XCircle, Zap, BarChart3, TrendingUp, Headphones, Clock, ArrowRight, Building2, Star, Shield } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import BillingCadenceToggle from '@/components/billing/BillingCadenceToggle';
import {
    fetchMyOrganization,
    fetchTrialStatus,
    startCheckout as startCheckoutRequest,
    startTrial
} from '@/lib/api';
import { formatCurrencyFromCents } from '@/lib/currency';

type Step = 'pricing' | 'plan' | 'checkout' | 'confirmation';
type PlanKey = 'BASIC' | 'PRO' | 'BUSINESS';
type BillingCycle = 'monthly' | 'annual';

const PLAN_VALUES = new Set<PlanKey>(['BASIC', 'PRO', 'BUSINESS']);

const isPlanKey = (value: string | null | undefined): value is PlanKey => {
    return Boolean(value && PLAN_VALUES.has(value as PlanKey));
};

const PLAN_PRICING: Record<PlanKey, { label: string; amountCents: number; description: string }> = {
    BASIC: { label: 'Basic', amountCents: 4900, description: 'Verified badge + org page + basic analytics.' },
    PRO: { label: 'Pro', amountCents: 9900, description: 'Advanced analytics + 30-day priority boost.' },
    BUSINESS: { label: 'Business', amountCents: 19900, description: 'High priority + featured placement + instant support.' }
};

const STEP_LABELS: { key: Step; label: string }[] = [
    { key: 'pricing', label: 'Pricing' },
    { key: 'plan', label: 'Plan' },
    { key: 'checkout', label: 'Checkout' },
    { key: 'confirmation', label: 'Confirmation' }
];

const STORAGE_KEY_PREFIX = 'verilnk:checkout:';
const PRO_TRIAL_DURATION_DAYS = 14;

const buildIdempotencyKey = (orgId: string, plan: PlanKey) => {
    return `${orgId}:${plan}:${Date.now()}`;
};

const calculateAnnualSavingsCents = (monthlyAmountCents: number) => {
    const monthlyTotalCents = Math.round(monthlyAmountCents * 12);
    const discountedAnnualCents = Math.round(monthlyAmountCents * 12 * 0.9);
    return monthlyTotalCents - discountedAnnualCents;
};

export default function OrgUpgradePage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        }>
            <OrgUpgradeContent />
        </Suspense>
    );
}

function OrgUpgradeContent() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();

    const [step, setStep] = useState<Step>('pricing');
    const [selectedPlan, setSelectedPlan] = useState<PlanKey | null>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [attempt, setAttempt] = useState<any>(null);
    const [orgName, setOrgName] = useState<string | null>(null);
    const [trialInfo, setTrialInfo] = useState<{ active: boolean; trial?: any; trialEndsAt?: string | null } | null>(null);
    const [trialMessage, setTrialMessage] = useState<string | null>(null);
    const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');

    const orgId = user?.organizationId || null;
    const storageKey = useMemo(() => (orgId ? `${STORAGE_KEY_PREFIX}${orgId}` : null), [orgId]);

    useEffect(() => {
        if (!loading && !user) router.push('/');
        if (!loading && user && !user.organizationId) router.push('/dashboard');
    }, [user, loading, router]);

    useEffect(() => {
        if (!user?.organizationId) return;
        fetchMyOrganization()
            .then(org => setOrgName(org?.name || null))
            .catch(() => setOrgName(null));
    }, [user]);

    useEffect(() => {
        if (!user?.organizationId) return;
        fetchTrialStatus()
            .then(setTrialInfo)
            .catch(() => setTrialInfo(null));
    }, [user]);

    useEffect(() => {
        if (!storageKey) return;
        const cached = window.localStorage.getItem(storageKey);
        if (!cached) return;
        try {
            const parsed = JSON.parse(cached);
            setAttempt(parsed);
            if (isPlanKey(parsed?.planType)) {
                setSelectedPlan(parsed.planType);
                setStep(parsed.status === 'success' ? 'confirmation' : 'checkout');
            }
        } catch {
            window.localStorage.removeItem(storageKey);
        }
    }, [storageKey]);

    useEffect(() => {
        const plan = searchParams.get('plan');
        const billing = searchParams.get('billing');
        const status = searchParams.get('status');

        if (billing === 'annual') {
            setBillingCycle('annual');
        } else if (billing === 'monthly') {
            setBillingCycle('monthly');
        }

        if (isPlanKey(plan)) {
            setSelectedPlan(plan);
            if (status === 'success') {
                setStep('confirmation');
                setMessage(null);
            } else if (status === 'failed') {
                setStep('checkout');
                setMessage('Payment failed. You can retry checkout.');
            } else if (status === 'canceled') {
                setStep('checkout');
                setMessage('Checkout was canceled.');
            } else {
                setStep((prev) => (prev === 'checkout' || prev === 'confirmation') ? prev : 'plan');
            }
            return;
        }

        setSelectedPlan(null);
        setStep('pricing');
    }, [searchParams]);

    const saveAttempt = (data: any) => {
        if (!storageKey) return;
        window.localStorage.setItem(storageKey, JSON.stringify(data));
    };

    const clearAttempt = () => {
        if (!storageKey) return;
        window.localStorage.removeItem(storageKey);
    };

    const getPrice = (plan: PlanKey) => {
        const monthlyCents = PLAN_PRICING[plan].amountCents;
        if (billingCycle === 'annual') {
            // Annual price = Monthly * 12 * 0.9 (10% discount)
            return Math.round(monthlyCents * 12 * 0.9);
        }
        return monthlyCents;
    };

    useEffect(() => {
        if (!selectedPlan) return;
        const currentPlan = searchParams.get('plan');
        const currentBilling = searchParams.get('billing');

        if (
            currentPlan === selectedPlan
            && currentBilling === billingCycle
            && !searchParams.get('status')
        ) {
            return;
        }

        const params = new URLSearchParams(searchParams.toString());
        params.set('plan', selectedPlan);
        params.set('billing', billingCycle);
        params.delete('status');
        params.delete('attempt');
        router.replace(`/org/upgrade?${params.toString()}`);
    }, [billingCycle, selectedPlan, searchParams, router]);

    const handleContinueToCheckout = () => {
        if (!selectedPlan) return;
        setMessage(null);
        setStep('checkout');
    };

    const handleStartCheckout = async () => {
        if (!orgId || !selectedPlan) return;
        setBusy(true);
        setMessage(null);
        try {
            const idempotencyKey = buildIdempotencyKey(orgId, selectedPlan);
            const result = await startCheckoutRequest(
                {
                    plan: selectedPlan,
                    billingCadence: billingCycle === 'annual' ? 'ANNUAL' : 'MONTHLY'
                },
                idempotencyKey
            );

            const payload = {
                status: 'pending',
                planType: selectedPlan,
                period: billingCycle,
                createdAt: new Date().toISOString()
            };
            setAttempt(payload);
            saveAttempt(payload);
            setStep('checkout');

            if (!result.redirectUrl) {
                setMessage('Checkout URL was not returned. Please try again.');
                return;
            }

            if (typeof window !== 'undefined') {
                window.location.assign(result.redirectUrl);
            }
        } catch (error: any) {
            setMessage(error.response?.data?.message || 'Failed to start checkout');
        } finally {
            setBusy(false);
        }
    };

    const handleReset = () => {
        clearAttempt();
        setAttempt(null);
        setMessage(null);
        setStep('plan');
    };

    const handleStartTrial = async () => {
        setBusy(true);
        setTrialMessage(null);
        try {
            const res = await startTrial({ durationDays: PRO_TRIAL_DURATION_DAYS, planType: 'PRO' });
            setTrialInfo({ active: true, trial: res.trial });
            setTrialMessage('Trial activated. Pro features are available without priority boost.');
        } catch (error: any) {
            if (error?.response?.data?.error === 'TRIAL_ALREADY_USED') {
                setTrialMessage('Trial already used for this organization.');
            } else {
                setTrialMessage(error.response?.data?.message || 'Unable to start trial.');
            }
        } finally {
            setBusy(false);
        }
    };

    const trialEndsAtValue = trialInfo?.trialEndsAt || trialInfo?.trial?.endsAt || null;
    const trialEndsAtLabel = trialEndsAtValue ? new Date(trialEndsAtValue).toLocaleDateString() : null;

    if (loading || !user?.organizationId) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-app pb-20">
            {/* Hero Header - Glassmorphic Card */}
            <div className="pt-8 pb-6">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <Link href="/pricing" className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors mb-6">
                        <ArrowRight className="w-4 h-4 rotate-180" />
                        Back to pricing
                    </Link>

                    <div className="surface-card rounded-2xl p-6 md:p-8 shadow-lg">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                            <div className="flex items-start gap-4">
                                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20">
                                    <Shield className="w-7 h-7 text-white" />
                                </div>
                                <div>
                                    <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">
                                        Upgrade Your Plan
                                    </h1>
                                    <p className="mt-1 text-slate-600 dark:text-slate-400 text-sm md:text-base">
                                        {orgName ? <span className="font-medium text-slate-700 dark:text-slate-300">{orgName}</span> : 'Your organization'} · Secure checkout with manual verification
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-100 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/20">
                                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Protected Checkout</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Progress Stepper */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8">
                <div className="surface-card rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center justify-between relative">
                        {/* Progress Line Background */}
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-0.5 bg-slate-200 dark:bg-slate-700 rounded-full z-0 hidden md:block" />
                        {/* Progress Line Active */}
                        <div
                            className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full z-0 transition-all duration-500 hidden md:block"
                            style={{ width: `${(STEP_LABELS.findIndex(s => s.key === step) / (STEP_LABELS.length - 1)) * 100}%` }}
                        />

                        {STEP_LABELS.map((item, index) => {
                            const isActive = step === item.key;
                            const isDone = STEP_LABELS.findIndex(s => s.key === step) > index;
                            return (
                                <div key={item.key} className="flex flex-col items-center gap-2 relative z-10 flex-1">
                                    <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${isDone
                                        ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                                        : isActive
                                            ? 'btn-primary shadow-lg shadow-blue-500/40 ring-4 ring-blue-500/20'
                                            : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                                        }`}>
                                        {isDone ? <CheckCircle className="w-5 h-5" /> : index + 1}
                                    </div>
                                    <span className={`text-xs font-medium text-center transition-colors ${isActive ? 'text-blue-600 dark:text-blue-400' : isDone ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'
                                        }`}>
                                        {item.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {message && (
                    <div className="mb-6 rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 px-5 py-4 text-sm text-amber-800 dark:text-amber-300 flex items-center gap-3">
                        <XCircle className="w-5 h-5 shrink-0" />
                        {message}
                    </div>
                )}

                {step === 'pricing' && (
                    <div className="grid lg:grid-cols-2 gap-6">
                        {/* Left Panel - Why Upgrade */}
                        <div className="surface-card rounded-2xl p-6 shadow-sm">
                            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                <Star className="w-5 h-5 text-amber-500" />
                                Why Upgrade?
                            </h2>
                            <div className="space-y-4">
                                <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/50">
                                    <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center shrink-0">
                                        <TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <div>
                                        <div className="font-medium text-slate-900 dark:text-white text-sm">Higher Visibility</div>
                                        <div className="text-xs text-slate-500 dark:text-slate-400">Priority ranking in search results and category listings</div>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/50">
                                    <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center shrink-0">
                                        <Zap className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                    </div>
                                    <div>
                                        <div className="font-medium text-slate-900 dark:text-white text-sm">Priority Ranking</div>
                                        <div className="text-xs text-slate-500 dark:text-slate-400">Boost your organization above competitors</div>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/50">
                                    <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center shrink-0">
                                        <BarChart3 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                                    </div>
                                    <div>
                                        <div className="font-medium text-slate-900 dark:text-white text-sm">Advanced Analytics</div>
                                        <div className="text-xs text-slate-500 dark:text-slate-400">Traffic heatmaps, category performance, and exports</div>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/50">
                                    <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center shrink-0">
                                        <Headphones className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                                    </div>
                                    <div>
                                        <div className="font-medium text-slate-900 dark:text-white text-sm">Faster Support</div>
                                        <div className="text-xs text-slate-500 dark:text-slate-400">Priority queue for Business tier subscribers</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right Panel - Action Card */}
                        <div className="bg-gradient-to-br from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 rounded-2xl p-6 shadow-lg shadow-blue-500/20 text-white relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-4">
                                    <ShieldCheck className="w-5 h-5" />
                                    <span className="text-sm font-medium text-blue-100">Ready to Get Started</span>
                                </div>
                                <h3 className="text-xl font-bold mb-2">Review Plans & Pricing</h3>
                                <p className="text-blue-100 text-sm mb-6">
                                    Compare features and select the plan that fits your organization's needs. Manual verification always applies.
                                </p>
                                <div className="space-y-3 mb-6">
                                    <div className="flex items-center gap-2 text-sm text-blue-100">
                                        <Clock className="w-4 h-4" />
                                        <span>~2 minutes to complete</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-blue-100">
                                        <Lock className="w-4 h-4" />
                                        <span>Secure checkout</span>
                                    </div>
                                </div>
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <Link href="/pricing#plans" className="px-5 py-2.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-sm font-medium text-center transition-all">
                                        View Pricing
                                    </Link>
                                    <button
                                        onClick={() => router.push('/pricing#plans')}
                                        className="px-5 py-2.5 rounded-xl bg-white text-blue-600 text-sm font-semibold hover:bg-blue-50 transition-all shadow-lg flex items-center justify-center gap-2"
                                    >
                                        Choose a Plan <ArrowRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {step === 'plan' && (
                    <div className="space-y-6">
                        {/* Billing Toggle */}
                        <div className="flex justify-center items-center gap-4">
                            <BillingCadenceToggle value={billingCycle} onChange={setBillingCycle} disabled={busy} />
                        </div>

                        {/* Selected Plan Card */}
                        {selectedPlan && (
                            <div className="max-w-3xl mx-auto">
                                <div className="text-left rounded-2xl border-2 p-6 shadow-sm surface-card border-blue-500 ring-4 ring-blue-500/20">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-xl font-semibold text-slate-900 dark:text-white">{PLAN_PRICING[selectedPlan].label}</h3>
                                        <CheckCircle className="w-5 h-5 text-blue-500" />
                                    </div>
                                    <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">{PLAN_PRICING[selectedPlan].description}</p>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-3xl font-bold text-slate-900 dark:text-white">
                                            {formatCurrencyFromCents(getPrice(selectedPlan), 'USD')}
                                        </span>
                                        <span className="text-sm text-slate-500 dark:text-slate-400">/{billingCycle === 'annual' ? 'yr' : 'mo'}</span>
                                    </div>
                                    {billingCycle === 'annual' && (
                                        <div className="mt-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                            Save {formatCurrencyFromCents(calculateAnnualSavingsCents(PLAN_PRICING[selectedPlan].amountCents), 'USD')} per year
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Action Bar */}
                        <div className="surface-card rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between gap-4">
                            <div className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">
                                <Lock className="w-4 h-4 text-slate-400" />
                                {trialInfo?.active
                                    ? <span>Trial active until <span className="font-medium">{trialEndsAtLabel || 'active period end'}</span></span>
                                    : 'Manual verification always applies. Start a Pro trial below.'}
                            </div>
                            <button
                                onClick={handleContinueToCheckout}
                                disabled={!selectedPlan || busy}
                                className="px-6 py-2.5 rounded-xl btn-primary text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/25 transition-all flex items-center gap-2"
                            >
                                Continue to Checkout <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Trial Section (PRO only) */}
                        {selectedPlan === 'PRO' && !trialInfo?.active && (
                            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-200 dark:border-emerald-500/20 rounded-2xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                <div>
                                    <div className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                                        <Zap className="w-4 h-4" />
                                        Try Pro First
                                    </div>
                                    <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">Trials include Pro analytics without priority boost. Limited exports apply.</p>
                                    {trialMessage && (
                                        <div className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">{trialMessage}</div>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleStartTrial}
                                        disabled={busy}
                                        className="px-4 py-2 rounded-xl border border-emerald-300 dark:border-emerald-600 text-sm text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 disabled:opacity-50 transition-colors"
                                    >
                                        14-day trial
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {step === 'checkout' && selectedPlan && (
                    <div className="grid lg:grid-cols-3 gap-6">
                        {/* Left Panel - Order Summary */}
                        <div className="lg:col-span-2 surface-card rounded-2xl p-6 shadow-sm">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
                                    <CreditCard className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Checkout</h2>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">Complete your upgrade to {PLAN_PRICING[selectedPlan].label}</p>
                                </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2 mb-6">
                                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50/50 dark:bg-slate-900/30">
                                    <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">Plan</div>
                                    <div className="text-xl font-bold text-slate-900 dark:text-white">{PLAN_PRICING[selectedPlan].label}</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{billingCycle === 'annual' ? '365' : '30'} day access</div>
                                </div>
                                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50/50 dark:bg-slate-900/30">
                                    <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">Amount</div>
                                    <div className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrencyFromCents(getPrice(selectedPlan), 'USD')}</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{billingCycle === 'annual' ? 'Annual payment' : 'Monthly payment'}</div>
                                </div>
                            </div>

                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50/50 dark:bg-slate-900/30 mb-6">
                                <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">Status</div>
                                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${attempt?.status === 'pending'
                                    ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400'
                                    : attempt?.status === 'failed'
                                        ? 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400'
                                        : 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400'
                                    }`}>
                                    {attempt?.status === 'pending' ? (
                                        <><Clock className="w-3 h-3" /> Redirect prepared</>
                                    ) : attempt?.status === 'failed' ? (
                                        <><XCircle className="w-3 h-3" /> Last attempt failed</>
                                    ) : (
                                        <><CheckCircle className="w-3 h-3" /> Ready to start</>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-3">
                                <button
                                    onClick={handleStartCheckout}
                                    disabled={busy}
                                    className="px-6 py-2.5 rounded-xl btn-primary text-sm font-medium disabled:opacity-50 shadow-lg shadow-blue-500/25 transition-all flex items-center gap-2"
                                >
                                    {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Redirecting...</> : <>Proceed to Payment <ArrowRight className="w-4 h-4" /></>}
                                </button>
                                <button
                                    onClick={handleReset}
                                    disabled={busy}
                                    className="px-5 py-2.5 rounded-xl border border-[var(--app-border)] text-sm text-[var(--app-text-secondary)] hover:bg-app-secondary transition-colors"
                                >
                                    Change Plan
                                </button>
                            </div>
                        </div>

                        {/* Right Panel - Security Note */}
                        <div className="surface-card rounded-2xl p-6 shadow-lg">
                            <div className="flex items-center gap-3 mb-4">
                                <ShieldCheck className="w-6 h-6 text-emerald-400" />
                                <span className="font-semibold">Secure Checkout</span>
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
                                You will be redirected to secure payment checkout to complete your upgrade.
                            </p>
                            <div className="space-y-3 text-sm text-slate-500 dark:text-slate-400">
                                <div className="flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                                    <span>256-bit encryption</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                                    <span>Manual verification required</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                                    <span>Instant plan activation</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {step === 'confirmation' && (
                    <div className="surface-card rounded-2xl p-8 shadow-sm text-center max-w-2xl mx-auto">
                        <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center mx-auto mb-6">
                            <CheckCircle className="w-8 h-8 text-emerald-500" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Payment Confirmed!</h2>
                        <p className="text-slate-600 dark:text-slate-300 mb-6">
                            Your subscription is now active. If your organization is still pending review, plan benefits will activate after approval.
                        </p>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                            <Link
                                href="/org/dashboard"
                                className="px-6 py-2.5 rounded-xl btn-primary text-sm font-medium shadow-lg shadow-blue-500/25 transition-all flex items-center gap-2"
                            >
                                <Building2 className="w-4 h-4" />
                                Go to Dashboard
                            </Link>
                            <button
                                onClick={handleReset}
                                className="px-5 py-2.5 rounded-xl border border-[var(--app-border)] text-sm text-[var(--app-text-secondary)] hover:bg-app-secondary transition-colors"
                            >
                                Start Another Checkout
                            </button>
                        </div>
                        {attempt?.status === 'failed' && (
                            <div className="mt-6 text-sm text-rose-600 dark:text-rose-400 flex items-center justify-center gap-2">
                                <XCircle className="w-4 h-4" />
                                Payment failed previously. You can retry from checkout.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
