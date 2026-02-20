'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useCountryDetection } from '../hooks/useCountryDetection';
import { getImageUrl } from '@/lib/utils';

type CountryRecord = {
    id: string;
    name?: string;
    code?: string;
    iso?: string;
    iso2?: string;
    flagImage?: string;
    flagImageUrl?: string;
};

interface CountryContextType {
    countryCode: string;
    countryName: string;
    countryId?: string;
    stateId?: string;
    stateName?: string;
    stateCode?: string;
    flagImage?: string;
    setCountry: (code: string, name: string, id?: string, flagImage?: string) => void;
    loading: boolean;
    isResolved: boolean;
}

const CountryContext = createContext<CountryContextType | undefined>(undefined);
let hasWarnedMissingGlobalCountry = false;

const isGlobalCountryValue = (code?: string | null, name?: string | null) => {
    const normalizedCode = String(code || '').trim().toUpperCase();
    const normalizedName = String(name || '').trim().toUpperCase();

    return (
        normalizedCode === 'GLOBAL'
        || normalizedCode === 'GL'
        || normalizedCode === 'WW'
        || normalizedName === 'GLOBAL'
    );
};

const normalizeCountrySelection = (code: string, name: string) => {
    if (isGlobalCountryValue(code, name)) {
        return { code: 'Global', name: 'Global' };
    }
    return { code, name };
};

const resolveCountryFlag = (country: CountryRecord): string | undefined => {
    if (country.flagImage) return getImageUrl(country.flagImage);
    if (country.flagImageUrl) return country.flagImageUrl;
    return undefined;
};

const findCountryByCode = (countries: CountryRecord[], code: string) => {
    const normalizedCode = String(code || '').trim().toUpperCase();
    return countries.find((country) => {
        const values = [
            country.code,
            country.iso2,
            country.iso
        ].map((value) => String(value || '').trim().toUpperCase());

        return values.includes(normalizedCode);
    });
};

const findGlobalCountry = (countries: CountryRecord[]) => {
    const byIso = countries.find((country) =>
        isGlobalCountryValue(country.code, country.name)
        || isGlobalCountryValue(country.iso2, country.name)
        || isGlobalCountryValue(country.iso, country.name)
    );

    if (byIso) return byIso;

    return countries.find((country) => String(country.name || '').trim().toLowerCase() === 'global');
};

export function CountryProvider({ children }: { children: React.ReactNode }) {
    // Auto-detect on mount
    const {
        countryCode: detectedCode,
        countryName: detectedName,
        stateName: detectedStateName,
        stateCode: detectedStateCode,
        loading: detectionLoading
    } = useCountryDetection();

    const [countryCode, setCountryCode] = useState('Global');
    const [countryName, setCountryName] = useState('Global');
    const [countryId, setCountryId] = useState<string | undefined>(undefined);
    const [stateId, setStateId] = useState<string | undefined>(undefined);
    const [stateName, setStateName] = useState<string | undefined>(undefined);
    const [stateCode, setStateCode] = useState<string | undefined>(undefined);
    const [flagImage, setFlagImage] = useState<string | undefined>(undefined);
    const [isInitialized, setIsInitialized] = useState(false);
    const [isResolved, setIsResolved] = useState(false);

    const normalizeStateValue = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '').trim();

    // Sync with detection and resolve ID
    useEffect(() => {
        const initialize = async () => {
            if (detectionLoading || isInitialized) {
                return;
            }

            const persistedCountryId = typeof window !== 'undefined'
                ? localStorage.getItem('user_country_id')
                : null;

            // Respect prior manual selection/persisted choice.
            if (persistedCountryId) {
                setIsInitialized(true);
                setIsResolved(true);
                return;
            }

            try {
                const { fetchCountries, fetchStates } = await import('@/lib/api');
                const countries: CountryRecord[] = await fetchCountries();

                const applyGlobalFallback = () => {
                    const globalCountry = findGlobalCountry(countries);

                    if (globalCountry) {
                        const normalized = normalizeCountrySelection(globalCountry.code || 'Global', globalCountry.name || 'Global');
                        setCountryCode(normalized.code);
                        setCountryName(normalized.name);
                        setCountryId(globalCountry.id);
                        setStateId(undefined);
                        setStateName(undefined);
                        setStateCode(undefined);
                        setFlagImage(resolveCountryFlag(globalCountry));
                        return;
                    }

                    if (!hasWarnedMissingGlobalCountry) {
                        console.warn('Global country (GL) not found in DB — falling back to previous global behavior');
                        hasWarnedMissingGlobalCountry = true;
                    }
                };

                const detectedCountry = detectedCode && !isGlobalCountryValue(detectedCode, detectedName)
                    ? findCountryByCode(countries, detectedCode)
                    : undefined;

                if (detectedCountry) {
                    const normalized = normalizeCountrySelection(detectedCountry.code || detectedCode, detectedCountry.name || detectedName);
                    setCountryCode(normalized.code);
                    setCountryName(normalized.name);
                    setCountryId(detectedCountry.id);
                    setFlagImage(resolveCountryFlag(detectedCountry));

                    if (detectedStateName || detectedStateCode) {
                        const states = await fetchStates(detectedCountry.id);
                        const normalizedStateName = detectedStateName ? normalizeStateValue(detectedStateName) : null;
                        const normalizedStateCode = detectedStateCode?.toLowerCase() || null;

                        const matchedState = states.find((state: { name: string; code?: string }) => {
                            if (normalizedStateCode && state.code && state.code.toLowerCase() === normalizedStateCode) {
                                return true;
                            }
                            if (normalizedStateName) {
                                return normalizeStateValue(state.name) === normalizedStateName;
                            }
                            return false;
                        });

                        if (matchedState) {
                            setStateId(matchedState.id);
                            setStateName(matchedState.name);
                            setStateCode(matchedState.code || detectedStateCode);
                        }
                    }
                } else {
                    applyGlobalFallback();
                }
            } catch (e) {
                console.error('Failed to resolve country ID', e);
            } finally {
                setIsInitialized(true);
                setIsResolved(true);
            }
        };
        initialize();
    }, [detectionLoading, detectedCode, detectedName, detectedStateName, detectedStateCode, isInitialized]);

    const handleSetCountry = (code: string, name: string, id?: string, flag?: string) => {
        const normalized = normalizeCountrySelection(code, name);
        setCountryCode(normalized.code);
        setCountryName(normalized.name);
        setCountryId(id);
        setStateId(undefined);
        setStateName(undefined);
        setStateCode(undefined);
        // Flag passed here is already a URL (either from external or getImageUrl)
        setFlagImage(flag);
        setIsResolved(true);

        // Persist override
        localStorage.setItem('user_country_code', normalized.code);
        localStorage.setItem('user_country_name', normalized.name);
        if (id) localStorage.setItem('user_country_id', id); else localStorage.removeItem('user_country_id');
        if (flag) localStorage.setItem('user_country_flag', flag); else localStorage.removeItem('user_country_flag');
    };

    // Load persisted ID/Flag on mount AND sync with backend to get latest Flag/Name
    useEffect(() => {
        const cachedId = localStorage.getItem('user_country_id');
        const cachedFlag = localStorage.getItem('user_country_flag');
        const cachedName = localStorage.getItem('user_country_name');
        const cachedCode = localStorage.getItem('user_country_code');

        if (cachedId) setCountryId(cachedId);
        if (cachedFlag) setFlagImage(getImageUrl(cachedFlag));
        if (cachedName) setCountryName(cachedName);
        if (cachedCode) setCountryCode(cachedCode);

        // If we have an ID, we should verify/update data (especially getting the new flag)
        if (cachedId) {
            const syncCountry = async () => {
                try {
                    const { fetchCountries } = await import('@/lib/api');
                    const countries = await fetchCountries();
                    const current = countries.find((c: any) => c.id === cachedId);

                    if (current) {
                        const normalized = normalizeCountrySelection(current.code, current.name);
                        // Update state with fresh data
                        setCountryCode(normalized.code);
                        setCountryName(normalized.name);

                        const finalFlag = current.flagImage ? getImageUrl(current.flagImage) : current.flagImageUrl;
                        setFlagImage(finalFlag);

                        // Update cache
                        localStorage.setItem('user_country_flag', finalFlag || '');
                        localStorage.setItem('user_country_name', normalized.name);
                        localStorage.setItem('user_country_code', normalized.code);
                    }
                } catch (error) {
                    console.error("Failed to sync country data", error);
                }
            };
            syncCountry();
        }
    }, []);

    return (
        <CountryContext.Provider value={{ countryCode, countryName, countryId, stateId, stateName, stateCode, flagImage, setCountry: handleSetCountry, loading: detectionLoading, isResolved }}>
            {children}
        </CountryContext.Provider>
    );
}

export function useCountry() {
    const context = useContext(CountryContext);
    if (context === undefined) {
        throw new Error('useCountry must be used within a CountryProvider');
    }
    return context;
}
