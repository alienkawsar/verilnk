import { prisma } from '../db/client';
import { Country } from '@prisma/client';

export const getAllCountries = async (includeDisabled = false): Promise<Country[]> => {
    return prisma.country.findMany({
        where: {
            deletedAt: null,
            ...(includeDisabled ? {} : { isEnabled: true }),
        },
        orderBy: {
            name: 'asc',
        },
    });
};

export const getCountryById = async (id: string): Promise<Country | null> => {
    return prisma.country.findFirst({
        where: {
            id,
            deletedAt: null,
        },
    });
};

export const createCountry = async (
    name: string,
    code: string,
    flagImage?: string,
    flagImageUrl?: string
): Promise<Country> => {
    const existingCountry = await prisma.country.findFirst({
        where: {
            OR: [{ name }, { code }],
        },
    });

    if (existingCountry) {
        if (existingCountry.deletedAt) {
            throw new Error(
                `Country with this name or code exists but is soft deleted (ID: ${existingCountry.id}). Please ask admin to restore it or permanently delete it.`
            );
        }
        throw new Error('Country with this name or code already exists');
    }

    return prisma.country.create({
        data: {
            name,
            code,
            flagImage,
            flagImageUrl,
        },
    });
};

export const updateCountry = async (
    id: string,
    data: Partial<{ name: string; code: string; flagImage: string; flagImageUrl: string; isEnabled: boolean }>
): Promise<Country> => {
    // Check if country exists
    const country = await prisma.country.findUnique({ where: { id } });
    if (!country || country.deletedAt) {
        throw new Error('Country not found');
    }

    // Check uniqueness if updating fields
    if (data.name || data.code) {
        const existing = await prisma.country.findFirst({
            where: {
                AND: [
                    { NOT: { id } },
                    {
                        OR: [
                            data.name ? { name: data.name } : {},
                            data.code ? { code: data.code } : {},
                        ],
                    },
                ],
            },
        });

        if (existing) {
            throw new Error('Country name or code already in use');
        }
    }

    return prisma.country.update({
        where: { id },
        data,
    });
};

export const deleteCountry = async (id: string): Promise<Country> => {
    const country = await prisma.country.findUnique({ where: { id } });
    if (!country || country.deletedAt) {
        throw new Error('Country not found');
    }

    return prisma.country.update({
        where: { id },
        data: {
            deletedAt: new Date(),
        },
    });
};
