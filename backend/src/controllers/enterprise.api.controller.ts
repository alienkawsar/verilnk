/**
 * Enterprise API Controller
 * 
 * Read-only API endpoints for enterprise customers.
 * All endpoints require valid API key with appropriate scopes.
 */

import { Response } from 'express';
import { ApiKeyRequest } from '../middleware/apikey.middleware';
import { prisma } from '../db/client';
import { VerificationStatus, OrgStatus } from '@prisma/client';
import {
    buildVisibleSiteWhere,
    isOrganizationEffectivelyRestricted
} from '../services/organization-visibility.service';

// ============================================
// GET /api/v1/verify - Verify a URL
// ============================================

export const verifyUrl = async (req: ApiKeyRequest, res: Response): Promise<void> => {
    try {
        const { url } = req.query;

        if (!url || typeof url !== 'string') {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Missing required query parameter: url'
            });
            return;
        }

        // Normalize URL
        let normalizedUrl = url.toLowerCase().trim();
        if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
            normalizedUrl = `https://${normalizedUrl}`;
        }

        // Remove trailing slash
        normalizedUrl = normalizedUrl.replace(/\/$/, '');

        // Try exact match first
        let site = await prisma.site.findFirst({
            where: {
                url: normalizedUrl,
                deletedAt: null
            },
            include: {
                organization: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        status: true,
                        planType: true,
                        logo: true
                    }
                },
                category: {
                    select: { id: true, name: true, slug: true }
                },
                country: {
                    select: { id: true, name: true, code: true }
                }
            }
        });

        // Try without protocol
        if (!site) {
            const urlWithoutProtocol = normalizedUrl.replace(/^https?:\/\//, '');
            site = await prisma.site.findFirst({
                where: {
                    OR: [
                        { url: { contains: urlWithoutProtocol } },
                        { url: `https://${urlWithoutProtocol}` },
                        { url: `http://${urlWithoutProtocol}` }
                    ],
                    deletedAt: null
                },
                include: {
                    organization: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            status: true,
                            planType: true,
                            logo: true
                        }
                    },
                    category: {
                        select: { id: true, name: true, slug: true }
                    },
                    country: {
                        select: { id: true, name: true, code: true }
                    }
                }
            });
        }

        if (!site) {
            res.json({
                verified: false,
                url: normalizedUrl,
                message: 'URL not found in VeriLnk directory'
            });
            return;
        }

        if (site.organizationId && await isOrganizationEffectivelyRestricted(site.organizationId)) {
            res.json({
                verified: false,
                url: normalizedUrl,
                message: 'URL not found in VeriLnk directory'
            });
            return;
        }

        const isVerified = site.status === VerificationStatus.SUCCESS;
        const orgApproved = site.organization?.status === OrgStatus.APPROVED;

        res.json({
            verified: isVerified && orgApproved,
            url: site.url,
            status: site.status,
            site: {
                id: site.id,
                name: site.name,
                url: site.url,
                status: site.status,
                category: site.category,
                country: site.country,
                createdAt: site.createdAt
            },
            organization: site.organization ? {
                id: site.organization.id,
                name: site.organization.name,
                slug: site.organization.slug,
                verified: site.organization.status === OrgStatus.APPROVED,
                logo: site.organization.logo
            } : null
        });
    } catch (error) {
        console.error('[Enterprise API] verifyUrl error:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to verify URL'
        });
    }
};

// ============================================
// GET /api/v1/directory - Browse directory
// ============================================

export const getDirectory = async (req: ApiKeyRequest, res: Response): Promise<void> => {
    try {
        const {
            country,
            category,
            search,
            page = '1',
            limit = '20'
        } = req.query;

        const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
        const skip = (pageNum - 1) * limitNum;

        // Build where clause
        const baseWhere: any = {
            status: VerificationStatus.SUCCESS
        };

        if (country && typeof country === 'string') {
            const countryRecord = await prisma.country.findFirst({
                where: { code: country.toUpperCase() }
            });
            if (countryRecord) {
                baseWhere.countryId = countryRecord.id;
            }
        }

        if (category && typeof category === 'string') {
            const categoryRecord = await prisma.category.findFirst({
                where: { slug: category.toLowerCase() }
            });
            if (categoryRecord) {
                baseWhere.categoryId = categoryRecord.id;
            }
        }

        if (search && typeof search === 'string') {
            baseWhere.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { url: { contains: search, mode: 'insensitive' } }
            ];
        }

        const where = await buildVisibleSiteWhere(baseWhere);

        const [sites, total] = await Promise.all([
            prisma.site.findMany({
                where,
                include: {
                    organization: {
                        select: { id: true, name: true, slug: true, logo: true }
                    },
                    category: {
                        select: { id: true, name: true, slug: true }
                    },
                    country: {
                        select: { id: true, name: true, code: true }
                    },
                    state: {
                        select: { id: true, name: true, code: true }
                    }
                },
                orderBy: { createdAt: 'desc' },
                take: limitNum,
                skip
            }),
            prisma.site.count({ where })
        ]);

        res.json({
            sites: sites.map(site => ({
                id: site.id,
                name: site.name,
                url: site.url,
                status: site.status,
                category: site.category,
                country: site.country,
                state: site.state,
                organization: site.organization ? {
                    id: site.organization.id,
                    name: site.organization.name,
                    slug: site.organization.slug,
                    logo: site.organization.logo
                } : null,
                createdAt: site.createdAt
            })),
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        console.error('[Enterprise API] getDirectory error:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to fetch directory'
        });
    }
};

// ============================================
// GET /api/v1/org/:slug - Organization profile
// ============================================

export const getOrganizationProfile = async (req: ApiKeyRequest, res: Response): Promise<void> => {
    try {
        const slug = req.params.slug as string;

        if (!slug) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Missing organization slug'
            });
            return;
        }

        const organization = await prisma.organization.findFirst({
            where: {
                slug: slug.toLowerCase(),
                status: OrgStatus.APPROVED,
                deletedAt: null
            },
            include: {
                country: {
                    select: { id: true, name: true, code: true }
                },
                state: {
                    select: { id: true, name: true, code: true }
                },
                category: {
                    select: { id: true, name: true, slug: true }
                },
                sites: {
                    where: {
                        status: VerificationStatus.SUCCESS,
                        deletedAt: null
                    },
                    select: {
                        id: true,
                        name: true,
                        url: true,
                        status: true,
                        createdAt: true
                    },
                    orderBy: { createdAt: 'desc' }
                }
            }
        });

        if (!organization) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Organization not found or not verified'
            });
            return;
        }

        if (await isOrganizationEffectivelyRestricted(organization.id)) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Organization not found or not verified'
            });
            return;
        }

        res.json({
            organization: {
                id: organization.id,
                name: organization.name,
                slug: organization.slug,
                about: organization.about,
                website: organization.website,
                logo: organization.logo,
                type: organization.type,
                planType: organization.planType,
                country: organization.country,
                state: organization.state,
                category: organization.category,
                verified: true,
                createdAt: organization.createdAt
            },
            sites: organization.sites,
            siteCount: organization.sites.length
        });
    } catch (error) {
        console.error('[Enterprise API] getOrganizationProfile error:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to fetch organization profile'
        });
    }
};

// ============================================
// GET /api/v1/categories - List categories
// ============================================

export const getCategories = async (req: ApiKeyRequest, res: Response): Promise<void> => {
    try {
        const categories = await prisma.category.findMany({
            where: { isActive: true },
            select: {
                id: true,
                name: true,
                slug: true,
                description: true,
                iconKey: true,
                _count: {
                    select: {
                        sites: {
                            where: {
                                status: VerificationStatus.SUCCESS,
                                deletedAt: null
                            }
                        }
                    }
                }
            },
            orderBy: { sortOrder: 'asc' }
        });

        res.json({
            categories: categories.map(cat => ({
                id: cat.id,
                name: cat.name,
                slug: cat.slug,
                description: cat.description,
                iconKey: cat.iconKey,
                siteCount: cat._count.sites
            }))
        });
    } catch (error) {
        console.error('[Enterprise API] getCategories error:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to fetch categories'
        });
    }
};

// ============================================
// GET /api/v1/countries - List countries
// ============================================

export const getCountries = async (req: ApiKeyRequest, res: Response): Promise<void> => {
    try {
        const countries = await prisma.country.findMany({
            where: {
                isEnabled: true,
                deletedAt: null
            },
            select: {
                id: true,
                name: true,
                code: true,
                flagImage: true,
                _count: {
                    select: {
                        sites: {
                            where: {
                                status: VerificationStatus.SUCCESS,
                                deletedAt: null
                            }
                        }
                    }
                }
            },
            orderBy: { name: 'asc' }
        });

        res.json({
            countries: countries.map(country => ({
                id: country.id,
                name: country.name,
                code: country.code,
                flagImage: country.flagImage,
                siteCount: country._count.sites
            }))
        });
    } catch (error) {
        console.error('[Enterprise API] getCountries error:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to fetch countries'
        });
    }
};
