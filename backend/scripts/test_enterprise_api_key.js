#!/usr/bin/env node

/**
 * Local verification script for Enterprise API key auth + directory access.
 *
 * Usage:
 *   VERILNK_API_KEY="vlnk_..." node scripts/test_enterprise_api_key.js
 *   VERILNK_API_KEY="vlnk_..." ENTERPRISE_API_BASE_URL="http://localhost:8000" node scripts/test_enterprise_api_key.js
 */

const BASE_URL = (process.env.ENTERPRISE_API_BASE_URL || process.env.API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '');
const API_KEY = process.env.VERILNK_API_KEY || process.env.ENTERPRISE_API_KEY || process.argv[2];

const maskKey = (value) => {
    if (!value || value.length < 6) return '***';
    return `***${value.slice(-6)}`;
};

const authHeaders = () => ({
    Authorization: `Bearer ${API_KEY}`,
    Accept: 'application/json'
});

const toQueryString = (params) =>
    Object.entries(params)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        .join('&');

const callEndpoint = async ({ label, path, params = {}, withAuth = true }) => {
    const query = toQueryString(params);
    const url = `${BASE_URL}${path}${query ? `?${query}` : ''}`;

    const response = await fetch(url, {
        method: 'GET',
        headers: withAuth ? authHeaders() : { Accept: 'application/json' }
    });

    const text = await response.text();
    let body = null;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        body = { raw: text };
    }

    return {
        label,
        url: withAuth ? url : `${url} (no auth)`,
        status: response.status,
        ok: response.ok,
        body
    };
};

const summarizeSites = (sites) =>
    sites.slice(0, 2).map((site) => ({
        id: site?.id ?? null,
        name: site?.name ?? null,
        url: site?.url ?? null,
        country: site?.country?.code || site?.country?.name || null,
        category: site?.category?.slug || site?.category?.name || null
    }));

const printStep = (title) => {
    console.log(`\n=== ${title} ===`);
};

const printStatus = (result) => {
    console.log(`- ${result.label}: ${result.status} ${result.ok ? 'OK' : 'FAILED'}`);
};

const main = async () => {
    if (!API_KEY) {
        console.error('Missing API key. Set VERILNK_API_KEY env var or pass as first argument.');
        process.exitCode = 1;
        return;
    }

    console.log(`Base URL: ${BASE_URL}`);
    console.log(`Using API key: ${maskKey(API_KEY)}`);

    printStep('Step 1: Service health');
    const health = await callEndpoint({
        label: 'GET /health',
        path: '/health',
        withAuth: false
    });
    printStatus(health);

    printStep('Step 2: Auth + scope probe');
    const countriesProbe = await callEndpoint({
        label: 'GET /api/v1/countries',
        path: '/api/v1/countries',
        withAuth: true
    });
    printStatus(countriesProbe);
    if (!countriesProbe.ok) {
        console.log('  response:', countriesProbe.body);
    }

    const countries = Array.isArray(countriesProbe.body?.countries) ? countriesProbe.body.countries : [];
    const primaryCountry = countries[0] || null;
    const countryCode = primaryCountry?.code || 'US';
    const countryName = primaryCountry?.name || null;

    const categoriesProbe = await callEndpoint({
        label: 'GET /api/v1/categories',
        path: '/api/v1/categories',
        withAuth: true
    });
    printStatus(categoriesProbe);
    if (!categoriesProbe.ok) {
        console.log('  response:', categoriesProbe.body);
    }
    const categories = Array.isArray(categoriesProbe.body?.categories) ? categoriesProbe.body.categories : [];
    const categorySlug = categories[0]?.slug || null;

    printStep('Step 3: Directory data attempts');
    const attempts = [];
    if (countryCode && categorySlug) {
        attempts.push({
            label: 'GET /api/v1/directory (country ISO + category slug)',
            path: '/api/v1/directory',
            params: { page: 1, limit: 10, country: countryCode, category: categorySlug }
        });
    }
    if (countryCode) {
        attempts.push({
            label: 'GET /api/v1/directory (country ISO)',
            path: '/api/v1/directory',
            params: { page: 1, limit: 10, country: countryCode }
        });
    }
    attempts.push({
        label: 'GET /api/v1/directory (no filters fallback)',
        path: '/api/v1/directory',
        params: { page: 1, limit: 10 }
    });
    if (countryName) {
        attempts.push({
            label: 'GET /api/v1/directory (country name fallback)',
            path: '/api/v1/directory',
            params: { page: 1, limit: 10, country: countryName }
        });
    }

    let foundResult = null;
    let unfilteredResult = null;
    let isoValidated = false;
    for (const attempt of attempts) {
        const result = await callEndpoint(attempt);
        printStatus(result);

        if (!result.ok) {
            console.log('  response:', result.body);
            continue;
        }

        const sites = Array.isArray(result.body?.sites) ? result.body.sites : [];
        const pagination = result.body?.pagination || null;
        console.log(`  sites returned: ${sites.length}`);
        if (pagination) {
            console.log('  pagination:', pagination);
        }

        if (attempt.label.includes('no filters fallback')) {
            unfilteredResult = result;
        }

        if (sites.length > 0) {
            console.log('  sample:', summarizeSites(sites));
            foundResult = result;
            if (attempt.label.includes('country ISO')) {
                isoValidated = true;
                break;
            }
            if (!attempt.label.includes('no filters fallback')) {
                break;
            }
        }
    }

    if (!isoValidated && unfilteredResult?.ok) {
        const fallbackSites = Array.isArray(unfilteredResult.body?.sites) ? unfilteredResult.body.sites : [];
        const discoveredCountryCode = fallbackSites[0]?.country?.code || null;
        if (discoveredCountryCode) {
            const isoFollowup = await callEndpoint({
                label: 'GET /api/v1/directory (discovered country ISO follow-up)',
                path: '/api/v1/directory',
                params: { page: 1, limit: 10, country: discoveredCountryCode }
            });
            printStatus(isoFollowup);
            if (isoFollowup.ok) {
                const sites = Array.isArray(isoFollowup.body?.sites) ? isoFollowup.body.sites : [];
                console.log(`  sites returned: ${sites.length}`);
                if (isoFollowup.body?.pagination) {
                    console.log('  pagination:', isoFollowup.body.pagination);
                }
                if (sites.length > 0) {
                    console.log('  sample:', summarizeSites(sites));
                    foundResult = isoFollowup;
                    isoValidated = true;
                }
            } else {
                console.log('  response:', isoFollowup.body);
            }
        }
    }

    printStep('Result');
    if (!foundResult) {
        console.log('No directory data returned from attempted queries.');
        process.exitCode = 1;
        return;
    }

    if (!isoValidated) {
        console.log('Directory access returned data, but not from a confirmed ISO-country-filtered request.');
    }
    console.log('Enterprise API key auth and directory access succeeded.');
};

main().catch((error) => {
    console.error('Script failed:', error?.message || error);
    process.exitCode = 1;
});
