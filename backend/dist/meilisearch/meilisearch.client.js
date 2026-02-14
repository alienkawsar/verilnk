"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SITES_INDEX = exports.meiliClient = void 0;
const meilisearch_1 = require("meilisearch");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const MEILISEARCH_HOST = process.env.MEILISEARCH_HOST || 'http://localhost:7700';
const MEILISEARCH_API_KEY = process.env.MEILISEARCH_API_KEY || '';
exports.meiliClient = new meilisearch_1.MeiliSearch({
    host: MEILISEARCH_HOST,
    apiKey: MEILISEARCH_API_KEY,
});
exports.SITES_INDEX = 'verilnk_sites';
