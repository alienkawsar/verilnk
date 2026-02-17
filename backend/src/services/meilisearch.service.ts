import { meiliClient, SITES_INDEX } from '../meilisearch/meilisearch.client';
import {
    Category,
    Country,
    OrgPriority,
    OrgStatus,
    Organization,
    Site,
    State,
    VerificationStatus
} from '@prisma/client';
import { prisma } from '../db/client';
import { getOrganizationEntitlements } from './entitlement.service';

interface SiteDocument {
    id: string;
    siteId: string;
    title: string;
    name: string;
    url: string;
    domain: string;
    countryIso: string;
    country_code: string;
    country_name: string;
    stateCode?: string | null;
    state_id?: string;
    state_name?: string;
    categoryId: string;
    category_id: string;
    categoryName: string;
    category_name: string;
    categorySlug: string;
    category_slug: string;
    tags: string[];
    isApproved: boolean;
    orgId?: string | null;
    organization_id?: string | null;
    organization_slug?: string | null;
    organization_public?: boolean;
    organizationWebsite?: string | null;
    organization_website?: string | null;
    orgPriority: OrgPriority;
    orgPriorityRank: number; // HIGH=1, MEDIUM=2, NORMAL=3, LOW=4
    organization_priority: number; // legacy score: HIGH=3, MEDIUM=2, NORMAL=1, LOW=0
    createdAt: number;
}

export interface SearchFilters {
    countryIso: string;
    stateId?: string;
    categoryId?: string;
    isApproved: boolean;
}

interface SearchPagination {
    limit?: number;
    offset?: number;
}

interface DetectedCategory {
    id: string;
    name: string;
    slug: string;
}

interface CategoryDetectionCandidate {
    id: string;
    name: string;
    slug: string;
    sortOrder: number;
    categoryTags: { tag: { slug: string; name: string } }[];
}

type IndexableSite = Site & {
    country: Country;
    category: Category;
    state?: State | null;
    organization?: Organization | null;
    siteTags?: { tag: { slug: string } }[];
};

const LEGACY_PRIORITY_SCORE_MAP: Record<OrgPriority, number> = {
    HIGH: 3,
    MEDIUM: 2,
    NORMAL: 1,
    LOW: 0
};

export const ORG_PRIORITY_RANK_MAP: Record<OrgPriority, number> = {
    HIGH: 1,
    MEDIUM: 2,
    NORMAL: 3,
    LOW: 4
};

const CATEGORY_DETECTION_TTL_MS = 5 * 60 * 1000;
const FETCH_BATCH_SIZE = 250;
const REINDEX_BATCH_SIZE = 500;
const MAX_EXACT_ID_SCAN = 5000;
const MAX_CATEGORY_SCAN = 5000;
const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CATEGORY_QUERY_SYNONYMS: Record<string, string[]> = {
    gov: ['government'],
    government: ['gov'],
    ministry: ['department'],
    dept: ['department', 'ministry'],
    uni: ['university'],
    university: ['uni', 'college', 'school'],
    college: ['university'],
    edu: ['education'],
    health: ['medical', 'hospital'],
    doc: ['doctor', 'medical'],
    job: ['career', 'vacancy'],
    passport: ['visa', 'immigration'],
    tax: ['revenue', 'irs'],
    commerce: ['business', 'trade']
};

let cachedCategories: { expiresAt: number; data: CategoryDetectionCandidate[] } | null = null;

const normalizeText = (value: string): string =>
    value
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const toWords = (value: string): string[] => {
    const normalized = normalizeText(value);
    if (!normalized) return [];
    return normalized.split(' ').filter(Boolean);
};

const withSynonyms = (words: string[]): Set<string> => {
    const expanded = new Set<string>(words);
    for (const word of words) {
        const direct = CATEGORY_QUERY_SYNONYMS[word] || [];
        for (const synonym of direct) {
            expanded.add(synonym);
        }

        for (const [key, values] of Object.entries(CATEGORY_QUERY_SYNONYMS)) {
            if (values.includes(word)) {
                expanded.add(key);
            }
        }
    }
    return expanded;
};

const escapeFilterValue = (value: string): string => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const getOrgPriority = (organization?: Organization | null): OrgPriority =>
    organization?.priority ?? OrgPriority.NORMAL;

const toOrgPriorityRank = (organization?: Organization | null): number =>
    ORG_PRIORITY_RANK_MAP[getOrgPriority(organization)] ?? ORG_PRIORITY_RANK_MAP.NORMAL;

const toLegacyPriorityScore = (organization?: Organization | null): number =>
    LEGACY_PRIORITY_SCORE_MAP[getOrgPriority(organization)] ?? LEGACY_PRIORITY_SCORE_MAP.NORMAL;

const getDocumentId = (hit: any): string => String(hit?.siteId || hit?.id || '');

const getHitOrgPriorityRank = (hit: any): number => {
    if (typeof hit?.orgPriorityRank === 'number') return hit.orgPriorityRank;
    if (typeof hit?.organization_priority === 'number') {
        // legacy score HIGH=3..LOW=0 mapped to rank HIGH=1..LOW=4
        const legacy = hit.organization_priority;
        if (legacy >= 3) return 1;
        if (legacy >= 2) return 2;
        if (legacy >= 1) return 3;
        return 4;
    }
    return ORG_PRIORITY_RANK_MAP.NORMAL;
};

const getHitCreatedAt = (hit: any): number => {
    if (typeof hit?.createdAt === 'number') return hit.createdAt;
    const parsed = Number(hit?.createdAt || 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

const getHitRankingScore = (hit: any): number => {
    const score = Number(hit?._rankingScore ?? 0);
    return Number.isFinite(score) ? score : 0;
};

const shouldBeIndexed = (site: IndexableSite): boolean => {
    if ((site as any).deletedAt) return false;
    if (site.status !== VerificationStatus.SUCCESS) return false;

    const org = site.organization;
    if (!org) return true;

    if ((org as any).deletedAt) return false;
    if (org.status !== OrgStatus.APPROVED) return false;

    return true;
};

const buildSiteDocument = (site: IndexableSite): SiteDocument => {
    const domain = (() => {
        try {
            return new URL(site.url).hostname;
        } catch {
            return site.url;
        }
    })();

    const org = site.organization;
    const orgEntitlements = org ? getOrganizationEntitlements(org) : null;
    const orgPriority = getOrgPriority(org);

    return {
        id: site.id,
        siteId: site.id,
        title: site.name,
        name: site.name,
        url: site.url,
        domain,
        countryIso: site.country.code,
        country_code: site.country.code,
        country_name: site.country.name,
        stateCode: site.state?.code ?? null,
        state_id: site.state?.id,
        state_name: site.state?.name,
        categoryId: site.categoryId,
        category_id: site.categoryId,
        categoryName: site.category.name,
        category_name: site.category.name,
        categorySlug: site.category.slug,
        category_slug: site.category.slug,
        tags: site.siteTags?.map((entry) => entry.tag.slug) || [],
        isApproved: site.status === VerificationStatus.SUCCESS,
        orgId: site.organizationId ?? null,
        organization_id: site.organizationId ?? null,
        organization_slug: org?.slug ?? null,
        organization_public: org ? orgEntitlements?.canAccessOrgPage === true : false,
        organizationWebsite: org?.website ?? null,
        organization_website: org?.website ?? null,
        orgPriority,
        orgPriorityRank: toOrgPriorityRank(org),
        organization_priority: toLegacyPriorityScore(org),
        createdAt: site.createdAt.getTime()
    };
};

const getCategoryCandidates = async (): Promise<CategoryDetectionCandidate[]> => {
    const now = Date.now();
    if (cachedCategories && cachedCategories.expiresAt > now) {
        return cachedCategories.data;
    }

    const categories = await prisma.category.findMany({
        where: { isActive: true },
        select: {
            id: true,
            name: true,
            slug: true,
            sortOrder: true,
            categoryTags: {
                select: {
                    tag: {
                        select: {
                            slug: true,
                            name: true
                        }
                    }
                }
            }
        }
    });

    cachedCategories = {
        expiresAt: now + CATEGORY_DETECTION_TTL_MS,
        data: categories
    };

    return categories;
};

const scoreCategory = (query: string, queryWords: Set<string>, category: CategoryDetectionCandidate): number => {
    const categoryName = normalizeText(category.name);
    const categorySlug = normalizeText(category.slug.replace(/-/g, ' '));
    const queryNormalized = normalizeText(query);

    let score = 0;

    if (queryNormalized === categoryName || queryNormalized === categorySlug) {
        score += 120;
    }

    if (queryNormalized.includes(categoryName)) {
        score += 60;
    }

    if (queryNormalized.includes(categorySlug)) {
        score += 50;
    }

    const slugWords = toWords(categorySlug);
    const nameWords = toWords(categoryName);
    for (const word of [...slugWords, ...nameWords]) {
        if (queryWords.has(word)) {
            score += 15;
        }
    }

    for (const entry of category.categoryTags) {
        const tagSlug = normalizeText(entry.tag.slug.replace(/-/g, ' '));
        const tagName = normalizeText(entry.tag.name);

        if (!tagSlug && !tagName) continue;

        if ((tagSlug && queryWords.has(tagSlug)) || (tagName && queryWords.has(tagName))) {
            score += 45;
        }

        if ((tagSlug && queryNormalized.includes(tagSlug)) || (tagName && queryNormalized.includes(tagName))) {
            score += 25;
        }
    }

    return score;
};

const detectCategoryFromQuery = async (query: string): Promise<DetectedCategory | undefined> => {
    const normalized = normalizeText(query);
    if (!normalized) return undefined;

    const words = withSynonyms(toWords(normalized));
    const categories = await getCategoryCandidates();

    const scored = categories
        .map((category) => ({
            category,
            score: scoreCategory(normalized, words, category)
        }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (a.category.sortOrder !== b.category.sortOrder) return a.category.sortOrder - b.category.sortOrder;
            return a.category.name.localeCompare(b.category.name);
        });

    const top = scored[0]?.category;
    if (!top) return undefined;

    return {
        id: top.id,
        name: top.name,
        slug: top.slug
    };
};

const resolveCategoryFromFilter = async (categoryId?: string): Promise<DetectedCategory | undefined> => {
    if (!categoryId) return undefined;
    const category = await prisma.category.findUnique({
        where: { id: categoryId },
        select: { id: true, name: true, slug: true, isActive: true }
    });

    if (!category || !category.isActive) return undefined;
    return { id: category.id, name: category.name, slug: category.slug };
};

const fetchAllHits = async (
    query: string,
    params: Record<string, unknown>,
    maxScan: number
): Promise<{ hits: any[]; estimatedTotal: number }> => {
    const index = meiliClient.index(SITES_INDEX);
    const hits: any[] = [];
    let cursor = 0;
    let estimatedTotal = 0;

    while (cursor < maxScan) {
        const limit = Math.min(FETCH_BATCH_SIZE, maxScan - cursor);
        const result = await index.search(query, {
            ...params,
            offset: cursor,
            limit
        } as any);

        const batch = result.hits || [];
        if (cursor === 0) {
            estimatedTotal = result.estimatedTotalHits || batch.length;
        }

        if (batch.length === 0) {
            break;
        }

        hits.push(...batch);
        cursor += batch.length;

        if (batch.length < limit) {
            break;
        }

        if (estimatedTotal && hits.length >= estimatedTotal) {
            break;
        }
    }

    return { hits, estimatedTotal };
};

const sortExactMatches = (hits: any[]): any[] =>
    [...hits].sort((a, b) => {
        const rankA = getHitOrgPriorityRank(a);
        const rankB = getHitOrgPriorityRank(b);
        if (rankA !== rankB) return rankA - rankB;

        const scoreA = getHitRankingScore(a);
        const scoreB = getHitRankingScore(b);
        if (scoreA !== scoreB) return scoreB - scoreA;

        const createdA = getHitCreatedAt(a);
        const createdB = getHitCreatedAt(b);
        if (createdA !== createdB) return createdB - createdA;

        return getDocumentId(a).localeCompare(getDocumentId(b));
    });

const buildScopeFilter = (filters: SearchFilters): string => {
    const parts: string[] = [];
    const countryIso = escapeFilterValue(filters.countryIso);

    parts.push(`(countryIso = \"${countryIso}\" OR country_code = \"${countryIso}\")`);
    parts.push(`isApproved = ${filters.isApproved}`);

    if (filters.categoryId) {
        const categoryId = escapeFilterValue(filters.categoryId);
        parts.push(`(categoryId = \"${categoryId}\" OR category_id = \"${categoryId}\")`);
    }

    if (filters.stateId) {
        const stateId = escapeFilterValue(filters.stateId);
        parts.push(`state_id = \"${stateId}\"`);
    }

    return parts.join(' AND ');
};

const buildCategoryExpansionFilter = (
    filters: SearchFilters,
    detectedCategory: DetectedCategory
): string => {
    const parts: string[] = [];
    const countryIso = escapeFilterValue(filters.countryIso);
    const categoryId = escapeFilterValue(detectedCategory.id);
    const categorySlug = escapeFilterValue(detectedCategory.slug);

    parts.push(`(countryIso = \"${countryIso}\" OR country_code = \"${countryIso}\")`);
    parts.push(`isApproved = ${filters.isApproved}`);
    parts.push(
        `((categoryId = \"${categoryId}\" OR category_id = \"${categoryId}\") OR (categorySlug = \"${categorySlug}\" OR category_slug = \"${categorySlug}\"))`
    );

    if (filters.stateId) {
        const stateId = escapeFilterValue(filters.stateId);
        parts.push(`state_id = \"${stateId}\"`);
    }

    return parts.join(' AND ');
};

const sortCategoryExpansion = (hits: any[]): any[] =>
    [...hits].sort((a, b) => {
        const rankA = getHitOrgPriorityRank(a);
        const rankB = getHitOrgPriorityRank(b);
        if (rankA !== rankB) return rankA - rankB;

        const createdA = getHitCreatedAt(a);
        const createdB = getHitCreatedAt(b);
        if (createdA !== createdB) return createdB - createdA;

        return getDocumentId(a).localeCompare(getDocumentId(b));
    });

export const resolveCountryIso = async (countryInput: string): Promise<string | null> => {
    const raw = String(countryInput || '').trim();
    if (!raw) return null;

    if (UUID_PATTERN.test(raw)) {
        const country = await prisma.country.findUnique({
            where: { id: raw },
            select: { code: true }
        });
        return country?.code?.toUpperCase() || null;
    }

    return raw.toUpperCase();
};

export const resolveStateCode = async (stateId?: string): Promise<string | undefined> => {
    if (!stateId) return undefined;

    const state = await prisma.state.findUnique({
        where: { id: stateId },
        select: { code: true }
    });

    return state?.code || undefined;
};

export const initializeMeilisearch = async () => {
    try {
        const index = meiliClient.index(SITES_INDEX);

        await index.update({ primaryKey: 'id' });

        await index.updateFilterableAttributes([
            'countryIso',
            'stateCode',
            'categoryId',
            'categorySlug',
            'orgId',
            // legacy support
            'country_code',
            'state_id',
            'category_id',
            'category_slug',
            'organization_id',
            'organization_slug',
            'isApproved'
        ]);

        await index.updateSearchableAttributes([
            'title',
            'name',
            'url',
            'domain',
            'tags',
            'categoryName',
            'categorySlug',
            // legacy support
            'category_name',
            'category_slug'
        ]);

        await index.updateSortableAttributes(['orgPriorityRank', 'createdAt', 'id', 'organization_priority']);

        await index.updateRankingRules(['exactness', 'words', 'typo', 'proximity', 'attribute', 'sort']);

        await index.updateSynonyms({
            gov: ['government'],
            government: ['gov'],
            egov: ['government', 'gov'],
            ministry: ['department'],
            dept: ['department', 'ministry'],
            uni: ['university'],
            university: ['uni', 'college', 'school'],
            college: ['university'],
            edu: ['education'],
            health: ['medical', 'hospital'],
            doc: ['doctor', 'medical'],
            job: ['career', 'vacancy'],
            passport: ['visa', 'immigration'],
            tax: ['revenue', 'irs'],
            commerce: ['business', 'trade']
        });

        await index.updateStopWords([
            'a',
            'an',
            'the',
            'of',
            'in',
            'on',
            'at',
            'to',
            'for',
            'is',
            'are',
            'was',
            'were',
            'be',
            'by',
            'with',
            'about',
            'from'
        ]);

        await index.updateTypoTolerance({
            enabled: true,
            minWordSizeForTypos: {
                oneTypo: 5,
                twoTypos: 9
            },
            disableOnWords: [],
            disableOnAttributes: []
        });

        const existingDocs = await index.getDocuments<Partial<SiteDocument>>({ limit: 1 });
        const sample = existingDocs.results?.[0];
        if (
            sample &&
            (
                sample.orgPriorityRank === undefined ||
                sample.countryIso === undefined ||
                sample.organization_website === undefined
            )
        ) {
            console.log('Detected legacy MeiliSearch document schema; triggering safe full reindex.');
            await reindexAllSites();
        }

        console.log('Meilisearch index initialized with organization-priority schema');
    } catch (error) {
        console.warn('Failed to initialize Meilisearch index:', error);
    }
};

export const indexSite = async (site: IndexableSite) => {
    try {
        if (!shouldBeIndexed(site)) {
            await removeSiteFromIndex(site.id);
            return;
        }

        const document = buildSiteDocument(site);
        await meiliClient.index(SITES_INDEX).addDocuments([document]);
    } catch (error) {
        console.error('Meilisearch indexing failed:', error);
    }
};

export const removeSiteFromIndex = async (siteId: string) => {
    try {
        await meiliClient.index(SITES_INDEX).deleteDocument(siteId);
    } catch (error) {
        console.error('Meilisearch deletion failed:', error);
    }
};

export const reindexOrganizationSites = async (organizationId: string) => {
    const sites = await prisma.site.findMany({
        where: { organizationId },
        include: {
            country: true,
            category: true,
            state: true,
            organization: true,
            siteTags: { include: { tag: true } }
        }
    });

    if (sites.length === 0) {
        return { organizationId, indexed: 0, removed: 0 };
    }

    const documents: SiteDocument[] = [];
    const removeIds: string[] = [];

    for (const site of sites) {
        const typedSite = site as IndexableSite;
        if (shouldBeIndexed(typedSite)) {
            documents.push(buildSiteDocument(typedSite));
        } else {
            removeIds.push(site.id);
        }
    }

    const index = meiliClient.index(SITES_INDEX);
    if (documents.length > 0) {
        await index.addDocuments(documents);
    }
    if (removeIds.length > 0) {
        await index.deleteDocuments(removeIds);
    }

    return {
        organizationId,
        indexed: documents.length,
        removed: removeIds.length
    };
};

export const searchSites = async (
    query: string,
    filters: SearchFilters,
    pagination?: SearchPagination
) => {
    const limit = pagination?.limit || 20;
    const offset = pagination?.offset || 0;

    try {
        const countryIso = await resolveCountryIso(filters.countryIso);
        if (!countryIso) {
            throw new Error('Country scope is invalid');
        }

        const scopedFilters: SearchFilters = {
            ...filters,
            countryIso
        };

        const detectedCategory = (await resolveCategoryFromFilter(scopedFilters.categoryId)) ||
            (await detectCategoryFromQuery(query));
        const filterString = buildScopeFilter(scopedFilters);
        const index = meiliClient.index(SITES_INDEX);

        const { hits: exactCandidates } = await fetchAllHits(
            query,
            {
                filter: filterString,
                matchingStrategy: 'all',
                showRankingScore: true
            },
            MAX_EXACT_ID_SCAN
        );

        const sortedExactCandidates = sortExactMatches(exactCandidates);
        const exactTotal = sortedExactCandidates.length;
        const exactHits = sortedExactCandidates.slice(offset, offset + limit);

        let categoryExpansion: any[] = [];
        let categoryTotal = 0;

        if (detectedCategory) {
            const exactIds = new Set(
                sortedExactCandidates.map((hit) => getDocumentId(hit)).filter(Boolean)
            );
            const categoryFilter = buildCategoryExpansionFilter(scopedFilters, detectedCategory);
            const { hits: categoryCandidates } = await fetchAllHits(
                '',
                {
                    filter: categoryFilter,
                    sort: ['orgPriorityRank:asc', 'createdAt:desc', 'id:asc'],
                    matchingStrategy: 'all'
                },
                MAX_CATEGORY_SCAN
            );

            const filteredCategory = sortCategoryExpansion(
                categoryCandidates.filter((hit) => {
                    const id = getDocumentId(hit);
                    return !!id && !exactIds.has(id);
                })
            );

            categoryTotal = filteredCategory.length;

            const categoryOffset = Math.max(0, offset - exactTotal);
            const remainingSlots = Math.max(0, limit - exactHits.length);
            if (remainingSlots > 0) {
                categoryExpansion = filteredCategory.slice(categoryOffset, categoryOffset + remainingSlots);
            }
        }

        const total = detectedCategory ? exactTotal + categoryTotal : exactTotal;
        const hits = [...exactHits, ...categoryExpansion];

        return {
            hits,
            total,
            limit,
            offset,
            exact: exactHits,
            categoryExpansion,
            detectedCategory,
            scope: {
                countryIso,
                ...(filters.stateId
                    ? {
                          stateCode: await resolveStateCode(filters.stateId)
                      }
                    : {})
            }
        };
    } catch (error: any) {
        console.error('Meilisearch search failed:', error);
        throw new Error('Search service unavailable. Database fallback is disabled by policy.');
    }
};

export const reindexAllSites = async () => {
    try {
        console.log('Starting full re-indexing...');

        const index = meiliClient.index(SITES_INDEX);
        await index.deleteAllDocuments();
        console.log('Cleared existing Meilisearch documents.');

        let lastCursor: string | null = null;
        let foundSites = false;
        let totalDocuments = 0;
        let lastTaskUid: number | undefined;

        while (true) {
            const sites = await prisma.site.findMany({
                take: REINDEX_BATCH_SIZE,
                ...(lastCursor
                    ? {
                          skip: 1,
                          cursor: { id: lastCursor }
                      }
                    : {}),
                where: {
                    status: VerificationStatus.SUCCESS,
                    deletedAt: null,
                    OR: [
                        { organizationId: null },
                        { organization: { status: OrgStatus.APPROVED, deletedAt: null } }
                    ]
                },
                include: {
                    country: true,
                    category: true,
                    state: true,
                    organization: true,
                    siteTags: { include: { tag: true } }
                },
                orderBy: { id: 'asc' }
            });

            if (sites.length === 0) break;
            foundSites = true;
            lastCursor = sites[sites.length - 1].id;

            const documents: SiteDocument[] = sites
                .map((site) => site as IndexableSite)
                .filter((site) => shouldBeIndexed(site))
                .map((site) => buildSiteDocument(site));

            if (documents.length === 0) continue;

            const task = await index.addDocuments(documents);
            lastTaskUid = task.taskUid;
            totalDocuments += documents.length;
            console.log(`Enqueued indexing task for ${documents.length} documents. Task params:`, task);
        }

        if (!foundSites) {
            console.log('No approved sites to index.');
            return;
        }

        if (totalDocuments === 0) {
            console.log('No eligible sites to index after filtering.');
            return;
        }

        return { count: totalDocuments, taskUid: lastTaskUid };
    } catch (error) {
        console.error('Re-indexing failed:', error);
        throw error;
    }
};
