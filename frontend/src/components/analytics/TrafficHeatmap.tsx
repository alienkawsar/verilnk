'use client';

import { useState, useEffect, useMemo } from 'react';

interface HeatmapData {
    dayOfWeek: number;
    hour: number;
    views: number;
    clicks: number;
}

interface TrafficHeatmapProps {
    heatmap: HeatmapData[];
    maxViews: number;
    maxClicks: number;
    range?: string;
    onRangeChange?: (range: string) => void;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => i);

export default function TrafficHeatmap({ heatmap, maxViews, maxClicks, range = '7d', onRangeChange }: TrafficHeatmapProps) {
    const [metric, setMetric] = useState<'views' | 'clicks'>('views');
    const [hoveredCell, setHoveredCell] = useState<{ day: number; hour: number } | null>(null);

    // Create a lookup map for fast access
    const dataMap = useMemo(() => {
        const map: Record<string, HeatmapData> = {};
        for (const item of heatmap) {
            map[`${item.dayOfWeek}-${item.hour}`] = item;
        }
        return map;
    }, [heatmap]);

    const maxValue = metric === 'views' ? maxViews : maxClicks;

    const getIntensity = (value: number): number => {
        if (maxValue === 0 || value === 0) return 0;
        return Math.min(value / maxValue, 1);
    };

    const getCellColor = (intensity: number): string => {
        if (intensity === 0) return 'bg-slate-100 dark:bg-slate-800/50';
        if (intensity < 0.2) return metric === 'views' ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-emerald-100 dark:bg-emerald-900/30';
        if (intensity < 0.4) return metric === 'views' ? 'bg-blue-200 dark:bg-blue-800/50' : 'bg-emerald-200 dark:bg-emerald-800/50';
        if (intensity < 0.6) return metric === 'views' ? 'bg-blue-300 dark:bg-blue-700/60' : 'bg-emerald-300 dark:bg-emerald-700/60';
        if (intensity < 0.8) return metric === 'views' ? 'bg-blue-400 dark:bg-blue-600/70' : 'bg-emerald-400 dark:bg-emerald-600/70';
        return metric === 'views' ? 'bg-blue-500 dark:bg-blue-500' : 'bg-emerald-500 dark:bg-emerald-500';
    };

    const hoveredData = hoveredCell ? dataMap[`${hoveredCell.day}-${hoveredCell.hour}`] : null;

    return (
        <div className="space-y-4">
            {/* Header Controls */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setMetric('views')}
                        className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${metric === 'views' ? 'bg-blue-500 text-white shadow-md' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                    >
                        Views
                    </button>
                    <button
                        onClick={() => setMetric('clicks')}
                        className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${metric === 'clicks' ? 'bg-emerald-500 text-white shadow-md' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                    >
                        Clicks
                    </button>
                </div>

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

            {/* Heatmap Grid */}
            <div className="overflow-x-auto touch-pan-x scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 -mx-2 px-2">
                <div className="min-w-[600px]">
                    {/* Hour Labels */}
                    <div className="flex pl-12">
                        {HOUR_LABELS.map(hour => (
                            <div key={hour} className="flex-1 text-center text-[10px] text-slate-400 font-medium">
                                {hour % 3 === 0 ? `${hour}:00` : ''}
                            </div>
                        ))}
                    </div>

                    {/* Grid Rows */}
                    {DAY_LABELS.map((day, dayIndex) => (
                        <div key={day} className="flex items-center">
                            <div className="w-12 text-right pr-2 text-xs text-slate-500 dark:text-slate-400 font-medium">{day}</div>
                            <div className="flex-1 flex gap-[2px]">
                                {HOUR_LABELS.map(hour => {
                                    const cellData = dataMap[`${dayIndex}-${hour}`];
                                    const value = cellData ? (metric === 'views' ? cellData.views : cellData.clicks) : 0;
                                    const intensity = getIntensity(value);

                                    return (
                                        <div
                                            key={hour}
                                            className={`flex-1 aspect-square rounded-sm ${getCellColor(intensity)} transition-all cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-slate-400 dark:hover:ring-slate-500`}
                                            onMouseEnter={() => setHoveredCell({ day: dayIndex, hour })}
                                            onMouseLeave={() => setHoveredCell(null)}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Legend */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>Less</span>
                    <div className="flex gap-0.5">
                        {[0, 0.2, 0.4, 0.6, 0.8, 1].map((intensity) => (
                            <div key={intensity} className={`w-3 h-3 rounded-sm ${getCellColor(intensity)}`} />
                        ))}
                    </div>
                    <span>More</span>
                </div>

                {/* Tooltip */}
                {hoveredData && (
                    <div className="text-xs bg-slate-900 text-white px-3 py-2 rounded-lg shadow-lg">
                        <strong>{DAY_LABELS[hoveredCell!.day]} {hoveredCell!.hour}:00</strong>
                        <div className="mt-1">{hoveredData.views} views · {hoveredData.clicks} clicks</div>
                    </div>
                )}
            </div>
        </div>
    );
}
