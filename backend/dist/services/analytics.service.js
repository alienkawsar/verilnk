"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEnterpriseAnalyticsOverview = exports.getEnterpriseAnalyticsExportData = exports.getEnterpriseAnalyticsCategories = exports.getEnterpriseAnalyticsHeatmap = exports.getEnterpriseAnalyticsHourly = exports.getEnterpriseAnalyticsSummary = exports.getEnterpriseAnalyticsDaily = exports.getWorkspaceLinkedOrgIds = exports.getBusinessInsights = exports.getExportData = exports.getCategoryPerformance = exports.getTrafficHeatmap = exports.getAnalytics = exports.trackClick = exports.trackView = exports.trackSearch = void 0;
const client_1 = require("../db/client");
const trackSearch = async (query, filters, resultsCount, ipHash) => {
    try {
        await client_1.prisma.searchLog.create({
            data: {
                query,
                filters: filters ? JSON.parse(JSON.stringify(filters)) : undefined,
                resultsCount,
                ipHash
            }
        });
    }
    catch (error) {
        console.error('[Analytics] Failed to log search:', error);
    }
};
exports.trackSearch = trackSearch;
const trackView = async (organizationId, siteId) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        // Track daily aggregate (existing behavior)
        await client_1.prisma.orgAnalytics.upsert({
            where: {
                organizationId_date: {
                    organizationId,
                    date: today
                }
            },
            update: {
                views: { increment: 1 }
            },
            create: {
                organizationId,
                date: today,
                views: 1,
                clicks: 0
            }
        });
        // Track event-level for hourly aggregation (new)
        await client_1.prisma.orgAnalyticsEvent.create({
            data: {
                organizationId,
                siteId: siteId || null,
                eventType: 'view'
            }
        });
    }
    catch (error) {
        console.error('[Analytics] Failed to track view:', error);
    }
};
exports.trackView = trackView;
const trackClick = async (organizationId, siteId) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        // Track daily aggregate (existing behavior)
        await client_1.prisma.orgAnalytics.upsert({
            where: {
                organizationId_date: {
                    organizationId,
                    date: today
                }
            },
            update: {
                clicks: { increment: 1 }
            },
            create: {
                organizationId,
                date: today,
                views: 0,
                clicks: 1
            }
        });
        // Track event-level for hourly aggregation (new)
        await client_1.prisma.orgAnalyticsEvent.create({
            data: {
                organizationId,
                siteId: siteId || null,
                eventType: 'click'
            }
        });
    }
    catch (error) {
        console.error('[Analytics] Failed to track click:', error);
    }
};
exports.trackClick = trackClick;
const getAnalytics = async (organizationId) => {
    try {
        const since = parseRange('30d');
        const events = (await client_1.prisma.orgAnalyticsEvent.findMany({
            where: {
                organizationId,
                createdAt: { gte: since }
            },
            select: {
                eventType: true,
                createdAt: true
            },
            orderBy: { createdAt: 'asc' }
        })) || [];
        const dayBucket = new Map();
        for (const event of events) {
            const key = toLocalDateKey(event.createdAt);
            const current = dayBucket.get(key) || { views: 0, clicks: 0 };
            if (event.eventType === 'view')
                current.views += 1;
            if (event.eventType === 'click')
                current.clicks += 1;
            dayBucket.set(key, current);
        }
        const stats = Array.from(dayBucket.entries())
            .map(([date, counts]) => ({
            date: new Date(`${date}T00:00:00`),
            views: counts.views,
            clicks: counts.clicks
        }))
            .sort((a, b) => a.date.getTime() - b.date.getTime());
        const totalViews = stats.reduce((acc, curr) => acc + curr.views, 0);
        const totalClicks = stats.reduce((acc, curr) => acc + curr.clicks, 0);
        return {
            stats,
            totalViews,
            totalClicks
        };
    }
    catch (error) {
        console.error('[Analytics] Failed to get stats:', error);
        throw new Error('Failed to fetch analytics');
    }
};
exports.getAnalytics = getAnalytics;
// ===== NEW ANALYTICS FEATURES =====
const parseRangeDays = (range, fallback = 30) => {
    if (typeof range === 'number') {
        if ([7, 30, 90].includes(range))
            return range;
        return fallback;
    }
    const normalized = String(range || '').trim().toLowerCase();
    if (normalized === '7' || normalized === '7d')
        return 7;
    if (normalized === '30' || normalized === '30d')
        return 30;
    if (normalized === '90' || normalized === '90d')
        return 90;
    return fallback;
};
const parseRange = (range) => {
    const now = new Date();
    const days = parseRangeDays(range, 7);
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);
    return startDate;
};
const toLocalDateKey = (value) => {
    const date = new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};
/**
 * Get traffic heatmap data (hourly aggregation)
 * Returns counts grouped by day of week (0-6) and hour (0-23)
 */
const getTrafficHeatmap = async (organizationId, range = '7d') => {
    const startDate = parseRange(range);
    const events = await client_1.prisma.orgAnalyticsEvent.findMany({
        where: {
            organizationId,
            createdAt: { gte: startDate }
        },
        select: {
            eventType: true,
            createdAt: true
        }
    });
    // Aggregate by day of week and hour
    const heatmapData = {};
    for (const event of events) {
        const date = new Date(event.createdAt);
        const dayOfWeek = date.getDay(); // 0-6
        const hour = date.getHours(); // 0-23
        const key = `${dayOfWeek}-${hour}`;
        if (!heatmapData[key]) {
            heatmapData[key] = { views: 0, clicks: 0 };
        }
        if (event.eventType === 'view') {
            heatmapData[key].views++;
        }
        else if (event.eventType === 'click') {
            heatmapData[key].clicks++;
        }
    }
    // Convert to array format
    const heatmap = Object.entries(heatmapData).map(([key, data]) => {
        const [dayOfWeek, hour] = key.split('-').map(Number);
        return { dayOfWeek, hour, ...data };
    });
    // Find max for legend scaling
    const maxViews = Math.max(...heatmap.map(h => h.views), 1);
    const maxClicks = Math.max(...heatmap.map(h => h.clicks), 1);
    return { heatmap, maxViews, maxClicks };
};
exports.getTrafficHeatmap = getTrafficHeatmap;
/**
 * Get category performance (top categories by views/clicks)
 */
const getCategoryPerformance = async (organizationId, range = '30d') => {
    const startDate = parseRange(range);
    // Get events with site -> category join
    const events = await client_1.prisma.orgAnalyticsEvent.findMany({
        where: {
            organizationId,
            createdAt: { gte: startDate },
            siteId: { not: null }
        },
        include: {
            site: {
                select: {
                    categoryId: true,
                    category: {
                        select: { id: true, name: true }
                    }
                }
            }
        }
    });
    // Aggregate by category
    const categoryData = {};
    for (const event of events) {
        if (!event.site?.category)
            continue;
        const catId = event.site.category.id;
        const catName = event.site.category.name;
        if (!categoryData[catId]) {
            categoryData[catId] = { name: catName, views: 0, clicks: 0 };
        }
        if (event.eventType === 'view') {
            categoryData[catId].views++;
        }
        else if (event.eventType === 'click') {
            categoryData[catId].clicks++;
        }
    }
    // Sort by total engagement and get top 10
    const topCategories = Object.entries(categoryData)
        .map(([categoryId, data]) => ({ categoryId, ...data }))
        .sort((a, b) => (b.views + b.clicks) - (a.views + a.clicks))
        .slice(0, 10);
    // Get daily trends for top 5 categories
    const topCategoryIds = topCategories.slice(0, 5).map(c => c.categoryId);
    const trendData = {};
    for (const event of events) {
        if (!event.site?.category)
            continue;
        const catId = event.site.category.id;
        if (!topCategoryIds.includes(catId))
            continue;
        const dateKey = toLocalDateKey(event.createdAt);
        if (!trendData[dateKey]) {
            trendData[dateKey] = {};
        }
        if (!trendData[dateKey][catId]) {
            trendData[dateKey][catId] = { views: 0, clicks: 0 };
        }
        if (event.eventType === 'view') {
            trendData[dateKey][catId].views++;
        }
        else if (event.eventType === 'click') {
            trendData[dateKey][catId].clicks++;
        }
    }
    // Flatten trends
    const trends = Object.entries(trendData).flatMap(([date, cats]) => Object.entries(cats).map(([categoryId, data]) => ({
        date,
        categoryId,
        ...data
    }))).sort((a, b) => a.date.localeCompare(b.date));
    return { topCategories, trends };
};
exports.getCategoryPerformance = getCategoryPerformance;
/**
 * Generate analytics export data
 */
const getExportData = async (organizationId, range = '30d') => {
    const startDate = parseRange(range);
    // Daily stats
    const dailyStats = await client_1.prisma.orgAnalytics.findMany({
        where: {
            organizationId,
            date: { gte: startDate }
        },
        orderBy: { date: 'asc' }
    });
    // Heatmap summary
    const { heatmap } = await (0, exports.getTrafficHeatmap)(organizationId, range);
    // Category performance
    const { topCategories } = await (0, exports.getCategoryPerformance)(organizationId, range);
    // Totals
    const totalViews = dailyStats.reduce((acc, curr) => acc + curr.views, 0);
    const totalClicks = dailyStats.reduce((acc, curr) => acc + curr.clicks, 0);
    return {
        summary: {
            range,
            totalViews,
            totalClicks,
            avgDailyViews: Math.round(totalViews / dailyStats.length) || 0,
            avgDailyClicks: Math.round(totalClicks / dailyStats.length) || 0
        },
        dailyStats: dailyStats.map(s => ({
            date: s.date.toISOString().split('T')[0],
            views: s.views,
            clicks: s.clicks
        })),
        topCategories,
        heatmapSummary: heatmap
    };
};
exports.getExportData = getExportData;
/**
 * Get business insights (benchmarks + reputation)
 * BUSINESS plan only
 */
const getBusinessInsights = async (organizationId) => {
    const MIN_SAMPLE_SIZE = 10;
    // Get the organization's country and category
    const org = await client_1.prisma.organization.findUnique({
        where: { id: organizationId },
        select: {
            countryId: true,
            stateId: true,
            categoryId: true
        }
    });
    if (!org)
        throw new Error('Organization not found');
    // Get org's totals for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);
    const orgStats = await client_1.prisma.orgAnalytics.aggregate({
        where: {
            organizationId,
            date: { gte: thirtyDaysAgo }
        },
        _sum: { views: true, clicks: true }
    });
    const orgViews = orgStats._sum.views || 0;
    const orgClicks = orgStats._sum.clicks || 0;
    // Try country + state + category first
    let benchmarkOrgs = await client_1.prisma.organization.findMany({
        where: {
            countryId: org.countryId,
            stateId: org.stateId || undefined,
            categoryId: org.categoryId,
            status: 'APPROVED',
            deletedAt: null
        },
        select: { id: true }
    });
    // Fall back to country + category if sample too small
    if (benchmarkOrgs.length < MIN_SAMPLE_SIZE) {
        benchmarkOrgs = await client_1.prisma.organization.findMany({
            where: {
                countryId: org.countryId,
                categoryId: org.categoryId,
                status: 'APPROVED',
                deletedAt: null
            },
            select: { id: true }
        });
    }
    const benchmarkOrgIds = benchmarkOrgs.map(o => o.id);
    // Get aggregated stats for all benchmark orgs
    const allOrgStats = await client_1.prisma.orgAnalytics.groupBy({
        by: ['organizationId'],
        where: {
            organizationId: { in: benchmarkOrgIds },
            date: { gte: thirtyDaysAgo }
        },
        _sum: { views: true, clicks: true }
    });
    // Calculate average and percentile
    const viewsArray = allOrgStats.map(s => s._sum.views || 0).sort((a, b) => a - b);
    const clicksArray = allOrgStats.map(s => s._sum.clicks || 0).sort((a, b) => a - b);
    const avgViews = viewsArray.length > 0 ? Math.round(viewsArray.reduce((a, b) => a + b, 0) / viewsArray.length) : 0;
    const avgClicks = clicksArray.length > 0 ? Math.round(clicksArray.reduce((a, b) => a + b, 0) / clicksArray.length) : 0;
    // Calculate percentile (how many orgs the current org beats)
    const viewsBelow = viewsArray.filter(v => v < orgViews).length;
    const percentile = viewsArray.length > 0 ? Math.round((viewsBelow / viewsArray.length) * 100) : 50;
    // Reputation signals
    const siteReports = await client_1.prisma.report.count({
        where: {
            site: {
                organizationId
            },
            deletedAt: null
        }
    });
    // Verified duration (days since approval)
    const orgFull = await client_1.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { createdAt: true, status: true }
    });
    const verifiedDays = orgFull?.status === 'APPROVED'
        ? Math.floor((Date.now() - new Date(orgFull.createdAt).getTime()) / (1000 * 60 * 60 * 24))
        : 0;
    return {
        benchmark: {
            percentile,
            sampleSize: benchmarkOrgs.length,
            categoryAverage: { views: avgViews, clicks: avgClicks },
            orgTotal: { views: orgViews, clicks: orgClicks }
        },
        reputation: {
            reportCount: siteReports,
            verifiedDays,
            status: orgFull?.status || 'UNKNOWN'
        }
    };
};
exports.getBusinessInsights = getBusinessInsights;
// ===== ENTERPRISE MULTI-ORG ANALYTICS =====
/**
 * Resolve linked organization IDs for a workspace.
 */
const getWorkspaceLinkedOrgIds = async (workspaceId) => {
    const linkedOrgs = await client_1.prisma.workspaceOrganization.findMany({
        where: { workspaceId },
        select: { organizationId: true }
    });
    // Source of truth is WorkspaceOrganization, but we also include enterprise
    // link-intents as a sync-safe fallback so analytics covers both linked orgs
    // and enterprise-created orgs without double-counting.
    const organizationIds = new Set(linkedOrgs.map((link) => link.organizationId));
    const linkRequestModel = client_1.prisma.enterpriseOrgLinkRequest;
    if (linkRequestModel) {
        try {
            const intentRows = await linkRequestModel.findMany({
                where: {
                    workspaceId,
                    // enterpriseOrgLinkRequest.organizationId is non-null in schema.
                    // Filter out empty identifiers without using nullable comparisons.
                    organizationId: { not: '' },
                    OR: [
                        { status: 'APPROVED' },
                        {
                            intentType: 'CREATE_UNDER_ENTERPRISE',
                            status: 'PENDING_APPROVAL'
                        }
                    ]
                },
                select: {
                    organizationId: true
                }
            });
            for (const row of intentRows) {
                if (typeof row.organizationId === 'string' && row.organizationId.trim().length > 0) {
                    organizationIds.add(row.organizationId);
                }
            }
        }
        catch (error) {
            // Soft-fail: analytics should still return linked org data from WorkspaceOrganization.
            console.warn('[Analytics] Failed to include enterprise link intents for workspace', {
                workspaceId,
                error
            });
        }
    }
    return Array.from(organizationIds);
};
exports.getWorkspaceLinkedOrgIds = getWorkspaceLinkedOrgIds;
const buildEnterpriseStartDate = (range) => {
    const rangeDays = parseRangeDays(range, 30);
    const since = new Date();
    since.setDate(since.getDate() - rangeDays);
    since.setHours(0, 0, 0, 0);
    return { rangeDays, since };
};
const getEnterpriseAnalyticsDaily = async (workspaceId, range = '30') => {
    const { rangeDays, since } = buildEnterpriseStartDate(range);
    const organizationIds = await (0, exports.getWorkspaceLinkedOrgIds)(workspaceId);
    if (organizationIds.length === 0) {
        return {
            rangeDays,
            series: []
        };
    }
    const events = (await client_1.prisma.orgAnalyticsEvent.findMany({
        where: {
            organizationId: { in: organizationIds },
            createdAt: { gte: since }
        },
        select: {
            eventType: true,
            createdAt: true
        }
    })) || [];
    const dayBucket = new Map();
    for (const event of events) {
        const key = toLocalDateKey(event.createdAt);
        const current = dayBucket.get(key) || { views: 0, clicks: 0 };
        if (event.eventType === 'view')
            current.views += 1;
        if (event.eventType === 'click')
            current.clicks += 1;
        dayBucket.set(key, current);
    }
    return {
        rangeDays,
        series: Array.from(dayBucket.entries())
            .map(([date, counts]) => ({
            date,
            views: counts.views,
            clicks: counts.clicks
        }))
            .sort((a, b) => a.date.localeCompare(b.date))
    };
};
exports.getEnterpriseAnalyticsDaily = getEnterpriseAnalyticsDaily;
const getEnterpriseAnalyticsSummary = async (workspaceId, range = '30') => {
    const { rangeDays, since } = buildEnterpriseStartDate(range);
    const organizationIds = await (0, exports.getWorkspaceLinkedOrgIds)(workspaceId);
    if (organizationIds.length === 0) {
        return {
            rangeDays,
            totals: { views: 0, clicks: 0, ctr: 0 },
            topOrgs: []
        };
    }
    const events = (await client_1.prisma.orgAnalyticsEvent.findMany({
        where: {
            organizationId: { in: organizationIds },
            createdAt: { gte: since }
        },
        select: {
            organizationId: true,
            eventType: true
        }
    })) || [];
    const orgBucket = new Map();
    for (const event of events) {
        const current = orgBucket.get(event.organizationId) || { views: 0, clicks: 0 };
        if (event.eventType === 'view')
            current.views += 1;
        if (event.eventType === 'click')
            current.clicks += 1;
        orgBucket.set(event.organizationId, current);
    }
    const totalViews = Array.from(orgBucket.values()).reduce((sum, item) => sum + item.views, 0);
    const totalClicks = Array.from(orgBucket.values()).reduce((sum, item) => sum + item.clicks, 0);
    const totals = {
        views: totalViews,
        clicks: totalClicks,
        ctr: totalViews > 0 ? (totalClicks / totalViews) * 100 : 0
    };
    const orgs = await client_1.prisma.organization.findMany({
        where: { id: { in: Array.from(orgBucket.keys()) } },
        select: { id: true, name: true, slug: true }
    });
    const orgMap = new Map(orgs.map((org) => [org.id, org]));
    const topOrgs = Array.from(orgBucket.entries())
        .map(([organizationId, counts]) => {
        const org = orgMap.get(organizationId);
        const views = counts.views;
        const clicks = counts.clicks;
        return {
            organizationId,
            name: org?.name || 'Unknown',
            slug: org?.slug || null,
            views,
            clicks,
            ctr: views > 0 ? (clicks / views) * 100 : 0
        };
    })
        .sort((a, b) => {
        if (b.views !== a.views)
            return b.views - a.views;
        if (b.clicks !== a.clicks)
            return b.clicks - a.clicks;
        return a.name.localeCompare(b.name);
    })
        .slice(0, 5);
    return {
        rangeDays,
        totals,
        topOrgs
    };
};
exports.getEnterpriseAnalyticsSummary = getEnterpriseAnalyticsSummary;
const getEnterpriseAnalyticsHourly = async (workspaceId, range = '30') => {
    const { rangeDays, since } = buildEnterpriseStartDate(range);
    const organizationIds = await (0, exports.getWorkspaceLinkedOrgIds)(workspaceId);
    if (organizationIds.length === 0) {
        return {
            rangeDays,
            hourly: []
        };
    }
    const events = await client_1.prisma.orgAnalyticsEvent.findMany({
        where: {
            organizationId: { in: organizationIds },
            createdAt: { gte: since }
        },
        select: {
            eventType: true,
            createdAt: true
        },
        orderBy: { createdAt: 'asc' }
    });
    const bucket = new Map();
    for (const event of events) {
        const hourDate = new Date(event.createdAt);
        hourDate.setMinutes(0, 0, 0);
        const hourKey = hourDate.toISOString();
        const current = bucket.get(hourKey) || { views: 0, clicks: 0 };
        if (event.eventType === 'view')
            current.views += 1;
        if (event.eventType === 'click')
            current.clicks += 1;
        bucket.set(hourKey, current);
    }
    return {
        rangeDays,
        hourly: Array.from(bucket.entries())
            .map(([hour, counts]) => ({ hour, ...counts }))
            .sort((a, b) => a.hour.localeCompare(b.hour))
    };
};
exports.getEnterpriseAnalyticsHourly = getEnterpriseAnalyticsHourly;
const getEnterpriseAnalyticsHeatmap = async (workspaceId, range = '30') => {
    const { rangeDays, since } = buildEnterpriseStartDate(range);
    const organizationIds = await (0, exports.getWorkspaceLinkedOrgIds)(workspaceId);
    if (organizationIds.length === 0) {
        return {
            rangeDays,
            heatmap: [],
            maxViews: 0,
            maxClicks: 0
        };
    }
    const events = await client_1.prisma.orgAnalyticsEvent.findMany({
        where: {
            organizationId: { in: organizationIds },
            createdAt: { gte: since }
        },
        select: {
            eventType: true,
            createdAt: true
        }
    });
    const heatmapData = {};
    for (const event of events) {
        const date = new Date(event.createdAt);
        const dayOfWeek = date.getDay();
        const hour = date.getHours();
        const key = `${dayOfWeek}-${hour}`;
        if (!heatmapData[key]) {
            heatmapData[key] = { views: 0, clicks: 0 };
        }
        if (event.eventType === 'view')
            heatmapData[key].views += 1;
        if (event.eventType === 'click')
            heatmapData[key].clicks += 1;
    }
    const heatmap = Object.entries(heatmapData).map(([key, data]) => {
        const [dayOfWeek, hour] = key.split('-').map(Number);
        return { dayOfWeek, hour, views: data.views, clicks: data.clicks };
    });
    return {
        rangeDays,
        heatmap,
        maxViews: Math.max(...heatmap.map((item) => item.views), 0),
        maxClicks: Math.max(...heatmap.map((item) => item.clicks), 0)
    };
};
exports.getEnterpriseAnalyticsHeatmap = getEnterpriseAnalyticsHeatmap;
const getEnterpriseAnalyticsCategories = async (workspaceId, range = '30') => {
    const { rangeDays, since } = buildEnterpriseStartDate(range);
    const organizationIds = await (0, exports.getWorkspaceLinkedOrgIds)(workspaceId);
    if (organizationIds.length === 0) {
        return {
            rangeDays,
            topCategories: [],
            topCategoriesByClicks: [],
            topCategoriesByViews: [],
            trends: []
        };
    }
    const events = await client_1.prisma.orgAnalyticsEvent.findMany({
        where: {
            organizationId: { in: organizationIds },
            createdAt: { gte: since },
            siteId: { not: null }
        },
        include: {
            site: {
                select: {
                    category: {
                        select: {
                            id: true,
                            slug: true,
                            name: true
                        }
                    }
                }
            }
        }
    });
    const categoryData = {};
    const trendData = {};
    for (const event of events) {
        const category = event.site?.category;
        if (!category)
            continue;
        const categoryId = category.id;
        if (!categoryData[categoryId]) {
            categoryData[categoryId] = {
                categoryId,
                slug: category.slug,
                name: category.name,
                views: 0,
                clicks: 0
            };
        }
        if (event.eventType === 'view')
            categoryData[categoryId].views += 1;
        if (event.eventType === 'click')
            categoryData[categoryId].clicks += 1;
        const dateKey = toLocalDateKey(event.createdAt);
        if (!trendData[dateKey])
            trendData[dateKey] = {};
        if (!trendData[dateKey][categoryId])
            trendData[dateKey][categoryId] = { views: 0, clicks: 0 };
        if (event.eventType === 'view')
            trendData[dateKey][categoryId].views += 1;
        if (event.eventType === 'click')
            trendData[dateKey][categoryId].clicks += 1;
    }
    const topCategories = Object.values(categoryData)
        .sort((a, b) => {
        const engagementA = a.views + a.clicks;
        const engagementB = b.views + b.clicks;
        if (engagementB !== engagementA)
            return engagementB - engagementA;
        return a.name.localeCompare(b.name);
    })
        .slice(0, 10);
    const topCategoriesByClicks = [...topCategories]
        .sort((a, b) => {
        if (b.clicks !== a.clicks)
            return b.clicks - a.clicks;
        return a.name.localeCompare(b.name);
    })
        .slice(0, 10);
    const topCategoriesByViews = [...topCategories]
        .sort((a, b) => {
        if (b.views !== a.views)
            return b.views - a.views;
        return a.name.localeCompare(b.name);
    })
        .slice(0, 10);
    const allowedCategoryIds = new Set(topCategories.map((item) => item.categoryId));
    const trends = Object.entries(trendData)
        .flatMap(([date, categories]) => Object.entries(categories)
        .filter(([categoryId]) => allowedCategoryIds.has(categoryId))
        .map(([categoryId, counts]) => ({
        date,
        categoryId,
        views: counts.views,
        clicks: counts.clicks
    })))
        .sort((a, b) => a.date.localeCompare(b.date));
    return {
        rangeDays,
        topCategories,
        topCategoriesByClicks,
        topCategoriesByViews,
        trends
    };
};
exports.getEnterpriseAnalyticsCategories = getEnterpriseAnalyticsCategories;
const getEnterpriseAnalyticsExportData = async (workspaceId, range = '30') => {
    const [summary, daily, categories] = await Promise.all([
        (0, exports.getEnterpriseAnalyticsSummary)(workspaceId, range),
        (0, exports.getEnterpriseAnalyticsDaily)(workspaceId, range),
        (0, exports.getEnterpriseAnalyticsCategories)(workspaceId, range)
    ]);
    return {
        summary,
        daily,
        categories
    };
};
exports.getEnterpriseAnalyticsExportData = getEnterpriseAnalyticsExportData;
/**
 * Legacy workspace overview endpoint shape used by existing enterprise frontend tab.
 */
const getEnterpriseAnalyticsOverview = async (workspaceId, range = '30d') => {
    const [daily, summary] = await Promise.all([
        (0, exports.getEnterpriseAnalyticsDaily)(workspaceId, range),
        (0, exports.getEnterpriseAnalyticsSummary)(workspaceId, range)
    ]);
    return {
        organizations: summary.topOrgs,
        totals: summary.totals,
        timeline: daily.series,
        topSites: []
    };
};
exports.getEnterpriseAnalyticsOverview = getEnterpriseAnalyticsOverview;
