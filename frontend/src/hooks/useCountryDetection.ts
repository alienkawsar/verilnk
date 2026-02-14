import { useState, useEffect } from 'react';

// IP detection using same-origin proxy to avoid CORS issues
// Fallback to 'Global' if fails
export const useCountryDetection = (initialCountry?: string) => {
    const [countryCode, setCountryCode] = useState<string>(initialCountry || 'Global');
    const [countryName, setCountryName] = useState<string>('Global');
    const [stateName, setStateName] = useState<string | undefined>(undefined);
    const [stateCode, setStateCode] = useState<string | undefined>(undefined);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (initialCountry) {
            setLoading(false);
            return;
        }

        const detectCountry = async () => {
            try {
                // Use same-origin proxy to avoid CORS issues
                const res = await fetch('/api/location', { cache: 'no-store' });

                if (res.ok) {
                    const data = await res.json();

                    if (data.country_code && data.country_name) {
                        setCountryCode(data.country_code);
                        setCountryName(data.country_name);
                        if (data.region) setStateName(data.region);
                        if (data.region_code) setStateCode(data.region_code);
                    }
                }
            } catch (error) {
                console.warn('IP Country detection failed, trying browser locale...', error);

                // Fallback to Browser Locale
                if (typeof navigator !== 'undefined' && navigator.language) {
                    const parts = navigator.language.split('-');
                    if (parts.length === 2) {
                        const fallbackCode = parts[1].toUpperCase();
                        setCountryCode(fallbackCode);
                        setCountryName(fallbackCode);
                    }
                }
            } finally {
                setLoading(false);
            }
        };

        detectCountry();
    }, [initialCountry]);

    return { countryCode, countryName, stateName, stateCode, loading };
};
