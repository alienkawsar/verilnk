"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reindexAllSites = exports.searchSites = exports.reindexOrganizationSites = exports.removeSiteFromIndex = exports.indexSite = exports.initializeMeilisearch = exports.resolveStateCode = exports.resolveCountryIso = exports.ORG_PRIORITY_RANK_MAP = void 0;
const meilisearch_client_1 = require("../meilisearch/meilisearch.client");
const client_1 = require("@prisma/client");
const client_2 = require("../db/client");
const entitlement_service_1 = require("./entitlement.service");
const LEGACY_PRIORITY_SCORE_MAP = {
    HIGH: 3,
    MEDIUM: 2,
    NORMAL: 1,
    LOW: 0
};
exports.ORG_PRIORITY_RANK_MAP = {
    HIGH: 1,
    MEDIUM: 2,
    NORMAL: 3,
    LOW: 4
};
const CATEGORY_DETECTION_TTL_MS = 5 * 60 * 1000;
const FETCH_BATCH_SIZE = 250;
const MAX_EXACT_ID_SCAN = 5000;
const MAX_CATEGORY_SCAN = 5000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORY_QUERY_SYNONYMS = {
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
let cachedCategories = null;
const normalizeText = (value) => value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const toWords = (value) => {
    const normalized = normalizeText(value);
    if (!normalized)
        return [];
    return normalized.split(' ').filter(Boolean);
};
const withSynonyms = (words) => {
    const expanded = new Set(words);
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
const escapeFilterValue = (value) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const getOrgPriority = (organization) => organization?.priority ?? client_1.OrgPriority.NORMAL;
const toOrgPriorityRank = (organization) => exports.ORG_PRIORITY_RANK_MAP[getOrgPriority(organization)] ?? exports.ORG_PRIORITY_RANK_MAP.NORMAL;
const toLegacyPriorityScore = (organization) => LEGACY_PRIORITY_SCORE_MAP[getOrgPriority(organization)] ?? LEGACY_PRIORITY_SCORE_MAP.NORMAL;
const getDocumentId = (hit) => String(hit?.siteId || hit?.id || '');
const getHitOrgPriorityRank = (hit) => {
    if (typeof hit?.orgPriorityRank === 'number')
        return hit.orgPriorityRank;
    if (typeof hit?.organization_priority === 'number') {
        // legacy score HIGH=3..LOW=0 mapped to rank HIGH=1..LOW=4
        const legacy = hit.organization_priority;
        if (legacy >= 3)
            return 1;
        if (legacy >= 2)
            return 2;
        if (legacy >= 1)
            return 3;
        return 4;
    }
    return exports.ORG_PRIORITY_RANK_MAP.NORMAL;
};
const getHitCreatedAt = (hit) => {
    if (typeof hit?.createdAt === 'number')
        return hit.createdAt;
    const parsed = Number(hit?.createdAt || 0);
    return Number.isFinite(parsed) ? parsed : 0;
};
const getHitRankingScore = (hit) => {
    const score = Number(hit?._rankingScore ?? 0);
    return Number.isFinite(score) ? score : 0;
};
const shouldBeIndexed = (site) => {
    if (site.deletedAt)
        return false;
    if (site.status !== client_1.VerificationStatus.SUCCESS)
        return false;
    const org = site.organization;
    if (!org)
        return true;
    if (org.deletedAt)
        return false;
    if (org.status !== client_1.OrgStatus.APPROVED)
        return false;
    return true;
};
const buildSiteDocument = (site) => {
    const domain = (() => {
        try {
            return new URL(site.url).hostname;
        }
        catch {
            return site.url;
        }
    })();
    const org = site.organization;
    const orgEntitlements = org ? (0, entitlement_service_1.getOrganizationEntitlements)(org) : null;
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
        isApproved: site.status === client_1.VerificationStatus.SUCCESS,
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
const getCategoryCandidates = async () => {
    const now = Date.now();
    if (cachedCategories && cachedCategories.expiresAt > now) {
        return cachedCategories.data;
    }
    const categories = await client_2.prisma.category.findMany({
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
const scoreCategory = (query, queryWords, category) => {
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
        if (!tagSlug && !tagName)
            continue;
        if ((tagSlug && queryWords.has(tagSlug)) || (tagName && queryWords.has(tagName))) {
            score += 45;
        }
        if ((tagSlug && queryNormalized.includes(tagSlug)) || (tagName && queryNormalized.includes(tagName))) {
            score += 25;
        }
    }
    return score;
};
const detectCategoryFromQuery = async (query) => {
    const normalized = normalizeText(query);
    if (!normalized)
        return undefined;
    const words = withSynonyms(toWords(normalized));
    const categories = await getCategoryCandidates();
    const scored = categories
        .map((category) => ({
        category,
        score: scoreCategory(normalized, words, category)
    }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => {
        if (b.score !== a.score)
            return b.score - a.score;
        if (a.category.sortOrder !== b.category.sortOrder)
            return a.category.sortOrder - b.category.sortOrder;
        return a.category.name.localeCompare(b.category.name);
    });
    const top = scored[0]?.category;
    if (!top)
        return undefined;
    return {
        id: top.id,
        name: top.name,
        slug: top.slug
    };
};
const resolveCategoryFromFilter = async (categoryId) => {
    if (!categoryId)
        return undefined;
    const category = await client_2.prisma.category.findUnique({
        where: { id: categoryId },
        select: { id: true, name: true, slug: true, isActive: true }
    });
    if (!category || !category.isActive)
        return undefined;
    return { id: category.id, name: category.name, slug: category.slug };
};
const fetchAllHits = async (query, params, maxScan) => {
    const index = meilisearch_client_1.meiliClient.index(meilisearch_client_1.SITES_INDEX);
    const hits = [];
    let cursor = 0;
    let estimatedTotal = 0;
    while (cursor < maxScan) {
        const limit = Math.min(FETCH_BATCH_SIZE, maxScan - cursor);
        const result = await index.search(query, {
            ...params,
            offset: cursor,
            limit
        });
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
const sortExactMatches = (hits) => [...hits].sort((a, b) => {
    const rankA = getHitOrgPriorityRank(a);
    const rankB = getHitOrgPriorityRank(b);
    if (rankA !== rankB)
        return rankA - rankB;
    const scoreA = getHitRankingScore(a);
    const scoreB = getHitRankingScore(b);
    if (scoreA !== scoreB)
        return scoreB - scoreA;
    const createdA = getHitCreatedAt(a);
    const createdB = getHitCreatedAt(b);
    if (createdA !== createdB)
        return createdB - createdA;
    return getDocumentId(a).localeCompare(getDocumentId(b));
});
const buildScopeFilter = (filters) => {
    const parts = [];
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
const buildCategoryExpansionFilter = (filters, detectedCategory) => {
    const parts = [];
    const countryIso = escapeFilterValue(filters.countryIso);
    const categoryId = escapeFilterValue(detectedCategory.id);
    const categorySlug = escapeFilterValue(detectedCategory.slug);
    parts.push(`(countryIso = \"${countryIso}\" OR country_code = \"${countryIso}\")`);
    parts.push(`isApproved = ${filters.isApproved}`);
    parts.push(`((categoryId = \"${categoryId}\" OR category_id = \"${categoryId}\") OR (categorySlug = \"${categorySlug}\" OR category_slug = \"${categorySlug}\"))`);
    if (filters.stateId) {
        const stateId = escapeFilterValue(filters.stateId);
        parts.push(`state_id = \"${stateId}\"`);
    }
    return parts.join(' AND ');
};
const sortCategoryExpansion = (hits) => [...hits].sort((a, b) => {
    const rankA = getHitOrgPriorityRank(a);
    const rankB = getHitOrgPriorityRank(b);
    if (rankA !== rankB)
        return rankA - rankB;
    const createdA = getHitCreatedAt(a);
    const createdB = getHitCreatedAt(b);
    if (createdA !== createdB)
        return createdB - createdA;
    return getDocumentId(a).localeCompare(getDocumentId(b));
});
const resolveCountryIso = async (countryInput) => {
    const raw = String(countryInput || '').trim();
    if (!raw)
        return null;
    if (UUID_PATTERN.test(raw)) {
        const country = await client_2.prisma.country.findUnique({
            where: { id: raw },
            select: { code: true }
        });
        return country?.code?.toUpperCase() || null;
    }
    return raw.toUpperCase();
};
exports.resolveCountryIso = resolveCountryIso;
const resolveStateCode = async (stateId) => {
    if (!stateId)
        return undefined;
    const state = await client_2.prisma.state.findUnique({
        where: { id: stateId },
        select: { code: true }
    });
    return state?.code || undefined;
};
exports.resolveStateCode = resolveStateCode;
const initializeMeilisearch = async () => {
    try {
        const index = meilisearch_client_1.meiliClient.index(meilisearch_client_1.SITES_INDEX);
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
        const existingDocs = await index.getDocuments({ limit: 1 });
        const sample = existingDocs.results?.[0];
        if (sample &&
            (sample.orgPriorityRank === undefined ||
                sample.countryIso === undefined ||
                sample.organization_website === undefined)) {
            console.log('Detected legacy MeiliSearch document schema; triggering safe full reindex.');
            await (0, exports.reindexAllSites)();
        }
        console.log('Meilisearch index initialized with organization-priority schema');
    }
    catch (error) {
        console.warn('Failed to initialize Meilisearch index:', error);
    }
};
exports.initializeMeilisearch = initializeMeilisearch;
const indexSite = async (site) => {
    try {
        if (!shouldBeIndexed(site)) {
            await (0, exports.removeSiteFromIndex)(site.id);
            return;
        }
        const document = buildSiteDocument(site);
        await meilisearch_client_1.meiliClient.index(meilisearch_client_1.SITES_INDEX).addDocuments([document]);
    }
    catch (error) {
        console.error('Meilisearch indexing failed:', error);
    }
};
exports.indexSite = indexSite;
const removeSiteFromIndex = async (siteId) => {
    try {
        await meilisearch_client_1.meiliClient.index(meilisearch_client_1.SITES_INDEX).deleteDocument(siteId);
    }
    catch (error) {
        console.error('Meilisearch deletion failed:', error);
    }
};
exports.removeSiteFromIndex = removeSiteFromIndex;
const reindexOrganizationSites = async (organizationId) => {
    const sites = await client_2.prisma.site.findMany({
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
    const documents = [];
    const removeIds = [];
    for (const site of sites) {
        const typedSite = site;
        if (shouldBeIndexed(typedSite)) {
            documents.push(buildSiteDocument(typedSite));
        }
        else {
            removeIds.push(site.id);
        }
    }
    const index = meilisearch_client_1.meiliClient.index(meilisearch_client_1.SITES_INDEX);
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
exports.reindexOrganizationSites = reindexOrganizationSites;
const searchSites = async (query, filters, pagination) => {
    const limit = pagination?.limit || 20;
    const offset = pagination?.offset || 0;
    try {
        const countryIso = await (0, exports.resolveCountryIso)(filters.countryIso);
        if (!countryIso) {
            throw new Error('Country scope is invalid');
        }
        const scopedFilters = {
            ...filters,
            countryIso
        };
        const detectedCategory = (await resolveCategoryFromFilter(scopedFilters.categoryId)) ||
            (await detectCategoryFromQuery(query));
        const filterString = buildScopeFilter(scopedFilters);
        const index = meilisearch_client_1.meiliClient.index(meilisearch_client_1.SITES_INDEX);
        const { hits: exactCandidates } = await fetchAllHits(query, {
            filter: filterString,
            matchingStrategy: 'all',
            showRankingScore: true
        }, MAX_EXACT_ID_SCAN);
        const sortedExactCandidates = sortExactMatches(exactCandidates);
        const exactTotal = sortedExactCandidates.length;
        const exactHits = sortedExactCandidates.slice(offset, offset + limit);
        let categoryExpansion = [];
        let categoryTotal = 0;
        if (detectedCategory) {
            const exactIds = new Set(sortedExactCandidates.map((hit) => getDocumentId(hit)).filter(Boolean));
            const categoryFilter = buildCategoryExpansionFilter(scopedFilters, detectedCategory);
            const { hits: categoryCandidates } = await fetchAllHits('', {
                filter: categoryFilter,
                sort: ['orgPriorityRank:asc', 'createdAt:desc', 'id:asc'],
                matchingStrategy: 'all'
            }, MAX_CATEGORY_SCAN);
            const filteredCategory = sortCategoryExpansion(categoryCandidates.filter((hit) => {
                const id = getDocumentId(hit);
                return !!id && !exactIds.has(id);
            }));
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
                        stateCode: await (0, exports.resolveStateCode)(filters.stateId)
                    }
                    : {})
            }
        };
    }
    catch (error) {
        console.error('Meilisearch search failed:', error);
        throw new Error('Search service unavailable. Database fallback is disabled by policy.');
    }
};
exports.searchSites = searchSites;
const reindexAllSites = async () => {
    try {
        console.log('Starting full re-indexing...');
        const index = meilisearch_client_1.meiliClient.index(meilisearch_client_1.SITES_INDEX);
        await index.deleteAllDocuments();
        console.log('Cleared existing Meilisearch documents.');
        const sites = await client_2.prisma.site.findMany({
            where: {
                status: client_1.VerificationStatus.SUCCESS,
                deletedAt: null,
                OR: [
                    { organizationId: null },
                    { organization: { status: client_1.OrgStatus.APPROVED, deletedAt: null } }
                ]
            },
            include: {
                country: true,
                category: true,
                state: true,
                organization: true,
                siteTags: { include: { tag: true } }
            }
        });
        if (sites.length === 0) {
            console.log('No approved sites to index.');
            return;
        }
        const documents = sites
            .map((site) => site)
            .filter((site) => shouldBeIndexed(site))
            .map((site) => buildSiteDocument(site));
        if (documents.length === 0) {
            console.log('No eligible sites to index after filtering.');
            return;
        }
        const task = await index.addDocuments(documents);
        console.log(`Enqueued indexing task for ${documents.length} documents. Task params:`, task);
        return { count: documents.length, taskUid: task.taskUid };
    }
    catch (error) {
        console.error('Re-indexing failed:', error);
        throw error;
    }
};
exports.reindexAllSites = reindexAllSites;
