'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useCountryDetection } from '../hooks/useCountryDetection';
import { getImageUrl } from '@/lib/utils';

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
            if (!detectionLoading && !isInitialized && detectedCode !== 'Global') {
                setCountryCode(detectedCode);
                setCountryName(detectedName);

                // Fetch countries to find ID and Flag if needed
                try {
                    // Lazy import to avoid circular dependency
                    const { fetchCountries, fetchStates } = await import('@/lib/api');
                    const countries = await fetchCountries();
                    const matched = countries.find((c: { code: string; id: string; flagImage?: string; flagImageUrl?: string }) => c.code === detectedCode);
                    if (matched) {
                        setCountryId(matched.id);
                        if (matched.flagImage) {
                            setFlagImage(getImageUrl(matched.flagImage));
                        } else if (matched.flagImageUrl) {
                            setFlagImage(matched.flagImageUrl);
                        }

                        if (detectedStateName || detectedStateCode) {
                            const states = await fetchStates(matched.id);
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
                    }
                } catch (e) {
                    console.error('Failed to resolve country ID', e);
                }

                setIsInitialized(true);
                setIsResolved(true);
            }
        };
        initialize();
    }, [detectionLoading, detectedCode, detectedName, detectedStateName, detectedStateCode, isInitialized]);

    useEffect(() => {
        if (!detectionLoading && !isResolved && detectedCode === 'Global') {
            setIsResolved(true);
        }
    }, [detectionLoading, detectedCode, isResolved]);

    const handleSetCountry = (code: string, name: string, id?: string, flag?: string) => {
        setCountryCode(code);
        setCountryName(name);
        setCountryId(id);
        setStateId(undefined);
        setStateName(undefined);
        setStateCode(undefined);
        // Flag passed here is already a URL (either from external or getImageUrl)
        setFlagImage(flag);
        setIsResolved(true);

        // Persist override
        localStorage.setItem('user_country_code', code);
        localStorage.setItem('user_country_name', name);
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
                        // Update state with fresh data
                        setCountryCode(current.code);
                        setCountryName(current.name);

                        const finalFlag = current.flagImage ? getImageUrl(current.flagImage) : current.flagImageUrl;
                        setFlagImage(finalFlag);

                        // Update cache
                        localStorage.setItem('user_country_flag', finalFlag || '');
                        localStorage.setItem('user_country_name', current.name);
                        localStorage.setItem('user_country_code', current.code);
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
