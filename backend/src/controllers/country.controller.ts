import { Request, Response } from 'express';
import * as countryService from '../services/country.service';
import { createCountrySchema, updateCountrySchema } from '../validations/country.validation';

export const getCountries = async (req: Request, res: Response): Promise<void> => {
    try {
        const includeDisabled = req.query.includeDisabled === 'true';
        const countries = await countryService.getAllCountries(includeDisabled);
        res.json(countries);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching countries' });
    }
};

export const createCountry = async (req: Request, res: Response): Promise<void> => {
    try {
        console.log('createCountry body:', req.body); // DEBUG
        const validation = createCountrySchema.safeParse(req.body);

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
        } else if (flagImageUrl) {
            flagImage = undefined;
        }
        const country = await countryService.createCountry(name, code, flagImage, flagImageUrl);
        res.status(201).json(country);
    } catch (error: any) {
        res.status(400).json({ message: error.message || 'Error creating country' });
    }
};

export const updateCountry = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        console.log('updateCountry body:', req.body); // DEBUG
        const validation = updateCountrySchema.safeParse(req.body);

        if (!validation.success) {
            console.error('updateCountry validation error:', JSON.stringify(validation.error.issues, null, 2)); // DEBUG
            res.status(400).json({
                message: 'Validation failed',
                errors: validation.error.issues
            });
            return;
        }

        const updateData = { ...validation.data } as any;
        if (updateData.flagImage === '') updateData.flagImage = null;
        if (updateData.flagImageUrl === '') updateData.flagImageUrl = null;

        if (updateData.flagImage) {
            updateData.flagImageUrl = null;
        } else if (updateData.flagImageUrl) {
            updateData.flagImage = null;
        }
        const country = await countryService.updateCountry(id as string, updateData);
        res.json(country);
    } catch (error: any) {
        if (error.message === 'Country not found') {
            res.status(404).json({ message: error.message });
            return;
        }
        res.status(400).json({ message: error.message || 'Error updating country' });
    }
};

export const deleteCountry = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        await countryService.deleteCountry(id as string);
        res.json({ message: 'Country deleted successfully' });
    } catch (error: any) {
        if (error.message === 'Country not found') {
            res.status(404).json({ message: error.message });
            return;
        }
        res.status(500).json({ message: 'Error deleting country' });
    }
};
