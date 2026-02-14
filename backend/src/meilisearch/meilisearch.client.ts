import { MeiliSearch } from 'meilisearch';
import dotenv from 'dotenv';
dotenv.config();

const MEILISEARCH_HOST = process.env.MEILISEARCH_HOST || 'http://localhost:7700';
const MEILISEARCH_API_KEY = process.env.MEILISEARCH_API_KEY || '';

export const meiliClient = new MeiliSearch({
    host: MEILISEARCH_HOST,
    apiKey: MEILISEARCH_API_KEY,
});

export const SITES_INDEX = 'verilnk_sites';
