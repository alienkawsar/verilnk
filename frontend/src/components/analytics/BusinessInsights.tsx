'use client';

import { TrendingUp, TrendingDown, Award, Shield, AlertTriangle, Clock, Info } from 'lucide-react';

interface BenchmarkData {
    percentile: number;
    sampleSize: number;
    categoryAverage: { views: number; clicks: number };
    orgTotal: { views: number; clicks: number };
}

interface ReputationData {
    reportCount: number;
    verifiedDays: number;
    status: string;
}

interface BusinessInsightsProps {
    benchmark: BenchmarkData;
    reputation: ReputationData;
}

export default function BusinessInsights({ benchmark, reputation }: BusinessInsightsProps) {
    const getPercentileLabel = (p: number): { label: string; color: string; icon: typeof TrendingUp } => {
        if (p >= 75) return { label: 'Top 25%', color: 'text-emerald-500', icon: TrendingUp };
        if (p >= 50) return { label: 'Above Average', color: 'text-blue-500', icon: TrendingUp };
        if (p >= 25) return { label: 'Below Average', color: 'text-amber-500', icon: TrendingDown };
        return { label: 'Bottom 25%', color: 'text-red-500', icon: TrendingDown };
    };

    const percentileInfo = getPercentileLabel(benchmark.percentile);
    const PercentileIcon = percentileInfo.icon;

    const getReputationScore = (): { score: string; color: string } => {
        if (reputation.reportCount > 5) return { score: 'At Risk', color: 'text-red-500' };
        if (reputation.reportCount > 2) return { score: 'Moderate', color: 'text-amber-500' };
        if (reputation.verifiedDays > 180) return { score: 'Excellent', color: 'text-emerald-500' };
        return { score: 'Good', color: 'text-blue-500' };
    };

    const reputationScore = getReputationScore();

    return (
        <div className="space-y-6">
            {/* Disclaimer */}
            <div className="flex items-start gap-2 p-3 bg-slate-100/50 dark:bg-slate-800/30 rounded-lg border border-slate-200/50 dark:border-slate-700/30">
                <Info className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    Benchmarks are aggregated and anonymized. Comparisons based on organizations in your category and country.
                </p>
            </div>

            {/* Benchmark Card */}
            <div className="bg-gradient-to-br from-slate-50 to-blue-50/50 dark:from-slate-800 dark:to-blue-900/20 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2 mb-4">
                    <Award className="w-5 h-5 text-blue-500" />
                    <h4 className="font-semibold text-slate-800 dark:text-slate-200">Performance Benchmark</h4>
                </div>

                {/* Percentile Display */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <div className={`text-3xl font-bold ${percentileInfo.color}`}>
                            {benchmark.percentile}%
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                            <PercentileIcon className={`w-4 h-4 ${percentileInfo.color}`} />
                            <span className={`text-sm font-medium ${percentileInfo.color}`}>{percentileInfo.label}</span>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-xs text-slate-500 dark:text-slate-400">Based on</div>
                        <div className="text-lg font-semibold text-slate-700 dark:text-slate-300">
                            {benchmark.sampleSize} orgs
                        </div>
                    </div>
                </div>

                {/* Comparison Grid */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/60 dark:bg-slate-900/40 rounded-lg p-3">
                        <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Your Views (30d)</div>
                        <div className="text-xl font-bold text-slate-800 dark:text-slate-200">
                            {benchmark.orgTotal.views.toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                            Avg: {benchmark.categoryAverage.views.toLocaleString()}
                        </div>
                    </div>
                    <div className="bg-white/60 dark:bg-slate-900/40 rounded-lg p-3">
                        <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Your Clicks (30d)</div>
                        <div className="text-xl font-bold text-slate-800 dark:text-slate-200">
                            {benchmark.orgTotal.clicks.toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                            Avg: {benchmark.categoryAverage.clicks.toLocaleString()}
                        </div>
                    </div>
                </div>
            </div>

            {/* Reputation Card */}
            <div className="bg-gradient-to-br from-slate-50 to-emerald-50/50 dark:from-slate-800 dark:to-emerald-900/20 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2 mb-4">
                    <Shield className="w-5 h-5 text-emerald-500" />
                    <h4 className="font-semibold text-slate-800 dark:text-slate-200">Reputation Signals</h4>
                </div>

                <div className="grid grid-cols-3 gap-4">
                    {/* Reputation Score */}
                    <div className="text-center p-3 bg-white/60 dark:bg-slate-900/40 rounded-lg">
                        <div className={`text-lg font-bold ${reputationScore.color}`}>
                            {reputationScore.score}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Status</div>
                    </div>

                    {/* Report Count */}
                    <div className="text-center p-3 bg-white/60 dark:bg-slate-900/40 rounded-lg">
                        <div className={`text-lg font-bold flex items-center justify-center gap-1 ${reputation.reportCount > 2 ? 'text-amber-500' : 'text-slate-700 dark:text-slate-300'}`}>
                            {reputation.reportCount > 0 && <AlertTriangle className="w-4 h-4" />}
                            {reputation.reportCount}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Reports</div>
                    </div>

                    {/* Verified Duration */}
                    <div className="text-center p-3 bg-white/60 dark:bg-slate-900/40 rounded-lg">
                        <div className="text-lg font-bold text-slate-700 dark:text-slate-300 flex items-center justify-center gap-1">
                            <Clock className="w-4 h-4 text-slate-400" />
                            {reputation.verifiedDays}d
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Verified</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
