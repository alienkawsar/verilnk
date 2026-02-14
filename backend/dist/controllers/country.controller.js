"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCountry = exports.updateCountry = exports.createCountry = exports.getCountries = void 0;
const countryService = __importStar(require("../services/country.service"));
const country_validation_1 = require("../validations/country.validation");
const getCountries = async (req, res) => {
    try {
        const includeDisabled = req.query.includeDisabled === 'true';
        const countries = await countryService.getAllCountries(includeDisabled);
        res.json(countries);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching countries' });
    }
};
exports.getCountries = getCountries;
const createCountry = async (req, res) => {
    try {
        console.log('createCountry body:', req.body); // DEBUG
        const validation = country_validation_1.createCountrySchema.safeParse(req.body);
        if (!validation.success) {
            console.error('createCountry validation error:', JSON.stringify(validation.error.issues, null, 2)); // DEBUG
            res.status(400).json({
                message: 'Validation failed',
                errors: validation.error.issues
            });
            return;
        }
        const { name, code } = validation.data;
        let flagImage = validation.data.flagImage === '' ? undefined : validation.data.flagImage;
        let flagImageUrl = validation.data.flagImageUrl === '' ? undefined : validation.data.flagImageUrl;
        if (flagImage) {
            flagImageUrl = undefined;
        }
        else if (flagImageUrl) {
            flagImage = undefined;
        }
        const country = await countryService.createCountry(name, code, flagImage, flagImageUrl);
        res.status(201).json(country);
    }
    catch (error) {
        res.status(400).json({ message: error.message || 'Error creating country' });
    }
};
exports.createCountry = createCountry;
const updateCountry = async (req, res) => {
    try {
        const { id } = req.params;
        console.log('updateCountry body:', req.body); // DEBUG
        const validation = country_validation_1.updateCountrySchema.safeParse(req.body);
        if (!validation.success) {
            console.error('updateCountry validation error:', JSON.stringify(validation.error.issues, null, 2)); // DEBUG
            res.status(400).json({
                message: 'Validation failed',
                errors: validation.error.issues
            });
            return;
        }
        const updateData = { ...validation.data };
        if (updateData.flagImage === '')
            updateData.flagImage = null;
        if (updateData.flagImageUrl === '')
            updateData.flagImageUrl = null;
        if (updateData.flagImage) {
            updateData.flagImageUrl = null;
        }
        else if (updateData.flagImageUrl) {
            updateData.flagImage = null;
        }
        const country = await countryService.updateCountry(id, updateData);
        res.json(country);
    }
    catch (error) {
        if (error.message === 'Country not found') {
            res.status(404).json({ message: error.message });
            return;
        }
        res.status(400).json({ message: error.message || 'Error updating country' });
    }
};
exports.updateCountry = updateCountry;
const deleteCountry = async (req, res) => {
    try {
        const { id } = req.params;
        await countryService.deleteCountry(id);
        res.json({ message: 'Country deleted successfully' });
    }
    catch (error) {
        if (error.message === 'Country not found') {
            res.status(404).json({ message: error.message });
            return;
        }
        res.status(500).json({ message: 'Error deleting country' });
    }
};
exports.deleteCountry = deleteCountry;
