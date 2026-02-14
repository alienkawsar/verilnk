'use client';

import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface CategoryData {
    categoryId: string;
    name: string;
    views: number;
    clicks: number;
}

interface TrendData {
    date: string;
    categoryId: string;
    views: number;
    clicks: number;
}

interface CategoryPerformanceProps {
    topCategories: CategoryData[];
    trends: TrendData[];
    range?: string;
    onRangeChange?: (range: string) => void;
}

export default function CategoryPerformance({ topCategories, trends, range = '30d', onRangeChange }: CategoryPerformanceProps) {
    // Calculate max values for bar scaling
    const maxViews = useMemo(() => Math.max(...topCategories.map(c => c.views), 1), [topCategories]);
    const maxClicks = useMemo(() => Math.max(...topCategories.map(c => c.clicks), 1), [topCategories]);

    // Group trends by category for sparklines
    const trendsByCategory = useMemo(() => {
        const grouped: Record<string, TrendData[]> = {};
        for (const trend of trends) {
            if (!grouped[trend.categoryId]) {
                grouped[trend.categoryId] = [];
            }
            grouped[trend.categoryId].push(trend);
        }
        // Sort each category's trends by date
        for (const catId of Object.keys(grouped)) {
            grouped[catId].sort((a, b) => a.date.localeCompare(b.date));
        }
        return grouped;
    }, [trends]);

    // Calculate trend direction
    const getTrendDirection = (categoryId: string): 'up' | 'down' | 'neutral' => {
        const catTrends = trendsByCategory[categoryId];
        if (!catTrends || catTrends.length < 2) return 'neutral';

        const halfPoint = Math.floor(catTrends.length / 2);
        const firstHalf = catTrends.slice(0, halfPoint).reduce((sum, t) => sum + t.views, 0);
        const secondHalf = catTrends.slice(halfPoint).reduce((sum, t) => sum + t.views, 0);

        if (secondHalf > firstHalf * 1.1) return 'up';
        if (secondHalf < firstHalf * 0.9) return 'down';
        return 'neutral';
    };

    // Generate sparkline path
    const generateSparkline = (categoryId: string): string => {
        const catTrends = trendsByCategory[categoryId];
        if (!catTrends || catTrends.length === 0) return '';

        const maxVal = Math.max(...catTrends.map(t => t.views), 1);
        const width = 100;
        const height = 24;
        const stepX = width / (catTrends.length - 1 || 1);

        return catTrends.map((t, i) => {
            const x = i * stepX;
            const y = height - (t.views / maxVal) * height;
            return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
        }).join(' ');
    };

    if (topCategories.length === 0) {
        return (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-900/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                No category performance data available for this period.
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header Controls */}
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Top Categories</h4>
                {onRangeChange && (
                    <select
                        value={range}
                        onChange={(e) => onRangeChange(e.target.value)}
                        className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                    >
                        <option value="7d">Last 7 Days</option>
                        <option value="30d">Last 30 Days</option>
                        <option value="90d">Last 90 Days</option>
                    </select>
                )}
            </div>

            {/* Categories List */}
            <div className="space-y-3">
                {topCategories.map((category, index) => {
                    const trendDir = getTrendDirection(category.categoryId);
                    const sparklinePath = generateSparkline(category.categoryId);

                    return (
                        <div key={category.categoryId} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 border border-slate-100 dark:border-slate-700/50">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <span className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-400">
                                        {index + 1}
                                    </span>
                                    <span className="font-medium text-slate-800 dark:text-slate-200">{category.name}</span>
                                </div>

                                {/* Trend Indicator */}
                                <div className="flex items-center gap-2">
                                    {sparklinePath && (
                                        <svg width="60" height="24" className="opacity-60">
                                            <path
                                                d={sparklinePath}
                                                fill="none"
                                                stroke={trendDir === 'up' ? '#10b981' : trendDir === 'down' ? '#ef4444' : '#94a3b8'}
                                                strokeWidth="1.5"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            />
                                        </svg>
                                    )}
                                    {trendDir === 'up' && <TrendingUp className="w-4 h-4 text-emerald-500" />}
                                    {trendDir === 'down' && <TrendingDown className="w-4 h-4 text-red-500" />}
                                    {trendDir === 'neutral' && <Minus className="w-4 h-4 text-slate-400" />}
                                </div>
                            </div>

                            {/* Stats Bars */}
                            <div className="space-y-2">
                                {/* Views Bar */}
                                <div className="flex items-center gap-3">
                                    <span className="w-16 text-xs text-slate-500 dark:text-slate-400">Views</span>
                                    <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-blue-500 rounded-full transition-all duration-500"
                                            style={{ width: `${(category.views / maxViews) * 100}%` }}
                                        />
                                    </div>
                                    <span className="w-12 text-xs font-semibold text-slate-600 dark:text-slate-300 text-right">
                                        {category.views.toLocaleString()}
                                    </span>
                                </div>

                                {/* Clicks Bar */}
                                <div className="flex items-center gap-3">
                                    <span className="w-16 text-xs text-slate-500 dark:text-slate-400">Clicks</span>
                                    <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                                            style={{ width: `${(category.clicks / maxClicks) * 100}%` }}
                                        />
                                    </div>
                                    <span className="w-12 text-xs font-semibold text-slate-600 dark:text-slate-300 text-right">
                                        {category.clicks.toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
