import 'dotenv/config';
import { prisma } from '../src/db/client';

/**
 * Seeds analytics events for testing the advanced analytics features.
 * Run with: npx ts-node prisma/seed-analytics.ts
 */
async function main() {
    console.log('Starting analytics seed...');

    // Get an approved organization with PRO or BUSINESS plan
    const org = await prisma.organization.findFirst({
        where: {
            status: 'APPROVED',
            planType: { in: ['PRO', 'BUSINESS'] }
        },
        include: {
            sites: true,
            category: true
        }
    });

    if (!org) {
        console.log('No approved PRO/BUSINESS organization found. Creating sample data for first approved org...');

        // Try any approved org
        const anyOrg = await prisma.organization.findFirst({
            where: { status: 'APPROVED' },
            include: { sites: true, category: true }
        });

        if (!anyOrg) {
            console.log('No approved organizations found. Seed some organizations first.');
            return;
        }

        await seedAnalyticsForOrg(anyOrg);
    } else {
        await seedAnalyticsForOrg(org);
    }

    console.log('Analytics seeding finished.');
}

async function seedAnalyticsForOrg(org: any) {
    console.log(`Seeding analytics for org: ${org.name} (${org.id})`);

    const now = new Date();
    const events: Array<{
        organizationId: string;
        siteId: string | null;
        eventType: string;
        createdAt: Date;
    }> = [];

    // Generate events for the last 30 days
    for (let daysAgo = 0; daysAgo < 30; daysAgo++) {
        const date = new Date(now);
        date.setDate(date.getDate() - daysAgo);

        // Generate between 10-50 events per day
        const eventsPerDay = Math.floor(Math.random() * 40) + 10;

        for (let i = 0; i < eventsPerDay; i++) {
            // Random hour (weighted towards business hours)
            const hour = getWeightedHour();
            date.setHours(hour, Math.floor(Math.random() * 60), Math.floor(Math.random() * 60));

            // 70% views, 30% clicks
            const eventType = Math.random() < 0.7 ? 'view' : 'click';

            // Random site (if org has sites) or null
            const siteId = org.sites.length > 0
                ? org.sites[Math.floor(Math.random() * org.sites.length)].id
                : null;

            events.push({
                organizationId: org.id,
                siteId,
                eventType,
                createdAt: new Date(date)
            });
        }
    }

    // Batch insert
    const result = await prisma.orgAnalyticsEvent.createMany({
        data: events,
        skipDuplicates: true
    });

    console.log(`Created ${result.count} analytics events`);

    // Also update OrgAnalytics daily aggregates
    await seedDailyAggregates(org.id, events);
}

function getWeightedHour(): number {
    // Weight towards business hours (9-18)
    const random = Math.random();
    if (random < 0.6) {
        // 60% chance: business hours (9-18)
        return Math.floor(Math.random() * 10) + 9;
    } else if (random < 0.85) {
        // 25% chance: evening hours (18-23)
        return Math.floor(Math.random() * 5) + 18;
    } else {
        // 15% chance: night/early morning (0-9)
        return Math.floor(Math.random() * 9);
    }
}

async function seedDailyAggregates(orgId: string, events: Array<{ eventType: string; createdAt: Date }>) {
    // Group events by date
    const dailyStats: Record<string, { views: number; clicks: number }> = {};

    for (const event of events) {
        const dateKey = event.createdAt.toISOString().split('T')[0];
        if (!dailyStats[dateKey]) {
            dailyStats[dateKey] = { views: 0, clicks: 0 };
        }
        if (event.eventType === 'view') {
            dailyStats[dateKey].views++;
        } else {
            dailyStats[dateKey].clicks++;
        }
    }

    // Upsert daily aggregates
    for (const [dateStr, stats] of Object.entries(dailyStats)) {
        const date = new Date(dateStr);
        date.setHours(0, 0, 0, 0);

        await prisma.orgAnalytics.upsert({
            where: {
                organizationId_date: {
                    organizationId: orgId,
                    date
                }
            },
            update: {
                views: { increment: stats.views },
                clicks: { increment: stats.clicks }
            },
            create: {
                organizationId: orgId,
                date,
                views: stats.views,
                clicks: stats.clicks
            }
        });
    }

    console.log(`Updated ${Object.keys(dailyStats).length} daily aggregate records`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
