"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCountry = exports.updateCountry = exports.createCountry = exports.getCountryById = exports.getAllCountries = void 0;
const client_1 = require("../db/client");
const getAllCountries = async (includeDisabled = false) => {
    return client_1.prisma.country.findMany({
        where: {
            deletedAt: null,
            ...(includeDisabled ? {} : { isEnabled: true }),
        },
        orderBy: {
            name: 'asc',
        },
    });
};
exports.getAllCountries = getAllCountries;
const getCountryById = async (id) => {
    return client_1.prisma.country.findFirst({
        where: {
            id,
            deletedAt: null,
        },
    });
};
exports.getCountryById = getCountryById;
const createCountry = async (name, code, flagImage, flagImageUrl) => {
    const existingCountry = await client_1.prisma.country.findFirst({
        where: {
            OR: [{ name }, { code }],
        },
    });
    if (existingCountry) {
        if (existingCountry.deletedAt) {
            throw new Error(`Country with this name or code exists but is soft deleted (ID: ${existingCountry.id}). Please ask admin to restore it or permanently delete it.`);
        }
        throw new Error('Country with this name or code already exists');
    }
    return client_1.prisma.country.create({
        data: {
            name,
            code,
            flagImage,
            flagImageUrl,
        },
    });
};
exports.createCountry = createCountry;
const updateCountry = async (id, data) => {
    // Check if country exists
    const country = await client_1.prisma.country.findUnique({ where: { id } });
    if (!country || country.deletedAt) {
        throw new Error('Country not found');
    }
    // Check uniqueness if updating fields
    if (data.name || data.code) {
        const existing = await client_1.prisma.country.findFirst({
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
    return client_1.prisma.country.update({
        where: { id },
        data,
    });
};
exports.updateCountry = updateCountry;
const deleteCountry = async (id) => {
    const country = await client_1.prisma.country.findUnique({ where: { id } });
    if (!country || country.deletedAt) {
        throw new Error('Country not found');
    }
    return client_1.prisma.country.update({
        where: { id },
        data: {
            deletedAt: new Date(),
        },
    });
};
exports.deleteCountry = deleteCountry;
