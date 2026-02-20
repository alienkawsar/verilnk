'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useCountryDetection } from '../hooks/useCountryDetection';
import { getImageUrl, isGlobalCountryCode, normalizeCountryCode } from '@/lib/utils';

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

    const [countryCode, setCountryCode] = useState('GL');
    const [countryName, setCountryName] = useState('Global');
    const [countryId, setCountryId] = useState<string | undefined>(undefined);
    const [stateId, setStateId] = useState<string | undefined>(undefined);
    const [stateName, setStateName] = useState<string | undefined>(undefined);
    const [stateCode, setStateCode] = useState<string | undefined>(undefined);
    const [flagImage, setFlagImage] = useState<string | undefined>(undefined);
    const [isInitialized, setIsInitialized] = useState(false);
    const [isResolved, setIsResolved] = useState(false);
    const globalResolveAttemptedRef = useRef(false);
    const globalMissingWarnedRef = useRef(false);

    const normalizeStateValue = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '').trim();

    // Sync with detection and resolve ID
    useEffect(() => {
        const initialize = async () => {
            const detectedIsGlobal = isGlobalCountryCode(detectedCode, detectedName);
            if (!detectionLoading && !isInitialized && !detectedIsGlobal) {
                setCountryCode(normalizeCountryCode(detectedCode));
                setCountryName(detectedName);

                // Fetch countries to find ID and Flag if needed
                try {
                    // Lazy import to avoid circular dependency
                    const { fetchCountries, fetchStates } = await import('@/lib/api');
                    const countries = await fetchCountries();
                    const detectedIso = normalizeCountryCode(detectedCode);
                    const matched = countries.find(
                        (c: { code: string; id: string; flagImage?: string; flagImageUrl?: string }) =>
                            normalizeCountryCode(c.code) === detectedIso,
                    );
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
        if (!detectionLoading && !isResolved && isGlobalCountryCode(detectedCode, detectedName)) {
            setIsResolved(true);
        }
    }, [detectionLoading, detectedCode, detectedName, isResolved]);

    useEffect(() => {
        if (detectionLoading) return;
        if (!isGlobalCountryCode(detectedCode, detectedName)) return;
        if (countryId) return;
        if (globalResolveAttemptedRef.current) return;

        globalResolveAttemptedRef.current = true;
        let cancelled = false;

        const resolveGlobalCountry = async () => {
            try {
                const { fetchCountries } = await import('@/lib/api');
                const countries = await fetchCountries();
                // Discovery note (frontend/src/context/CountryContext.tsx):
                // homepage selector is controlled by countryId (frontend/src/app/HomeClient.tsx),
                // so fallback must resolve and set the DB Global country ID here.
                const globalCountry = (countries || []).find(
                    (country: { code?: string; name?: string }) =>
                        isGlobalCountryCode(country?.code, country?.name),
                );

                if (cancelled) return;

                // Respect a user/chached selection if it was set while resolving.
                if (localStorage.getItem('user_country_id')) {
                    setIsResolved(true);
                    return;
                }

                if (!globalCountry?.id) {
                    if (!globalMissingWarnedRef.current) {
                        console.warn('Global country (GL) not found in DB — falling back to previous global behavior');
                        globalMissingWarnedRef.current = true;
                    }
                    setIsResolved(true);
                    return;
                }

                const finalFlag = globalCountry.flagImage
                    ? getImageUrl(globalCountry.flagImage)
                    : (globalCountry.flagImageUrl || undefined);
                const globalCode = normalizeCountryCode(globalCountry.code || 'GL');

                setCountryCode(globalCode);
                setCountryName('Global');
                setCountryId(globalCountry.id);
                setStateId(undefined);
                setStateName(undefined);
                setStateCode(undefined);
                setFlagImage(finalFlag);
                setIsInitialized(true);
                setIsResolved(true);

                localStorage.setItem('user_country_code', globalCode);
                localStorage.setItem('user_country_name', 'Global');
                localStorage.setItem('user_country_id', globalCountry.id);
                if (finalFlag) localStorage.setItem('user_country_flag', finalFlag);
                else localStorage.removeItem('user_country_flag');
            } catch (error) {
                if (cancelled) return;
                if (!globalMissingWarnedRef.current) {
                    console.warn('Global country (GL) not found in DB — falling back to previous global behavior');
                    globalMissingWarnedRef.current = true;
                }
                console.error('Failed to resolve Global country row', error);
                setIsResolved(true);
            }
        };

        void resolveGlobalCountry();
        return () => {
            cancelled = true;
        };
    }, [countryId, detectedCode, detectedName, detectionLoading]);

    const handleSetCountry = (code: string, name: string, id?: string, flag?: string) => {
        const isGlobal = isGlobalCountryCode(code, name);
        const nextCode = isGlobal ? 'GL' : normalizeCountryCode(code);
        const nextName = isGlobal ? 'Global' : name;

        setCountryCode(nextCode);
        setCountryName(nextName);
        setCountryId(id);
        setStateId(undefined);
        setStateName(undefined);
        setStateCode(undefined);
        // Flag passed here is already a URL (either from external or getImageUrl)
        setFlagImage(flag);
        setIsResolved(true);

        // Persist override
        localStorage.setItem('user_country_code', nextCode);
        localStorage.setItem('user_country_name', nextName);
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
        if (cachedName) setCountryName(isGlobalCountryCode(cachedCode, cachedName) ? 'Global' : cachedName);
        if (cachedCode) setCountryCode(isGlobalCountryCode(cachedCode, cachedName) ? 'GL' : normalizeCountryCode(cachedCode));

        // If we have an ID, we should verify/update data (especially getting the new flag)
        if (cachedId) {
            const syncCountry = async () => {
                try {
                    const { fetchCountries } = await import('@/lib/api');
                    const countries = await fetchCountries();
                    const current = countries.find((c: any) => c.id === cachedId);

                    if (current) {
                        // Update state with fresh data
                        const nextCode = isGlobalCountryCode(current.code, current.name) ? 'GL' : normalizeCountryCode(current.code);
                        const nextName = isGlobalCountryCode(current.code, current.name) ? 'Global' : current.name;
                        setCountryCode(nextCode);
                        setCountryName(nextName);

                        const finalFlag = current.flagImage ? getImageUrl(current.flagImage) : current.flagImageUrl;
                        setFlagImage(finalFlag);

                        // Update cache
                        localStorage.setItem('user_country_flag', finalFlag || '');
                        localStorage.setItem('user_country_name', nextName);
                        localStorage.setItem('user_country_code', nextCode);
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
