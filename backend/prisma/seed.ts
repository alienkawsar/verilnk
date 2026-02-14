import 'dotenv/config';
import { PrismaClient, AdminRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

console.log("Seed: DATABASE_URL is", process.env.DATABASE_URL ? "defined" : "undefined");

const prisma = new PrismaClient();

async function main() {
    console.log('Start seeding ...');

    // Categories (Top 10)
    const categories = [
        { name: 'Government & Public Services', slug: 'government-public-services', sortOrder: 1 },
        { name: 'Education & Research', slug: 'education-research', sortOrder: 2 },
        { name: 'Healthcare & Social Welfare', slug: 'healthcare-social-welfare', sortOrder: 3 },
        { name: 'Finance, Tax & Banking', slug: 'finance-tax-banking', sortOrder: 4 },
        { name: 'Immigration, Travel & Transport', slug: 'immigration-travel-transport', sortOrder: 5 },
        { name: 'Business, Trade & Employment', slug: 'business-trade-employment', sortOrder: 6 },
        { name: 'Law, Justice & Public Safety', slug: 'law-justice-public-safety', sortOrder: 7 },
        { name: 'Digital & Technology Services', slug: 'digital-technology-services', sortOrder: 8 },
        { name: 'Environment, Energy & Utilities', slug: 'environment-energy-utilities', sortOrder: 9 },
        { name: 'Media, Culture & Tourism', slug: 'media-culture-tourism', sortOrder: 10 },
    ];

    for (const category of categories) {
        await prisma.category.upsert({
            where: { slug: category.slug },
            update: {
                name: category.name,
                sortOrder: category.sortOrder,
                isActive: true
            },
            create: {
                name: category.name,
                slug: category.slug,
                sortOrder: category.sortOrder,
                isActive: true
            },
        });
    }

    // Countries
    const countries = [
        { name: 'Bangladesh', code: 'BD' },
        { name: 'United States', code: 'US' },
        { name: 'United Kingdom', code: 'GB' },
        { name: 'Canada', code: 'CA' },
        { name: 'Australia', code: 'AU' },
        { name: 'India', code: 'IN' },
        { name: 'Germany', code: 'DE' },
        { name: 'France', code: 'FR' },
        { name: 'Japan', code: 'JP' },
        { name: 'Singapore', code: 'SG' },
    ];

    for (const country of countries) {
        await prisma.country.upsert({
            where: { code: country.code },
            update: {},
            create: {
                name: country.name,
                code: country.code,
            },
        });
    }

    // Super Admin
    const superAdminEmail = 'admin@verilnk.com';
    // Note: In a real app, password should be hashed (e.g., using bcrypt)
    const superAdminPassword = await bcrypt.hash('ALLAH@is1', 10);

    await prisma.admin.upsert({
        where: { email: superAdminEmail },
        update: {},
        create: {
            email: superAdminEmail,
            password: superAdminPassword,
            role: AdminRole.SUPER_ADMIN,
        },
    });

    console.log('Seeding finished.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
