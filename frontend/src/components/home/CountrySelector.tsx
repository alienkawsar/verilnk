'use client';

import { useRouter } from 'next/navigation';
import { useCountry } from '@/context/CountryContext';
import ModernDropdown from '@/components/ui/ModernDropdown';
import { getImageUrl } from '@/lib/utils';

interface Country {
    id: string;
    name: string;
    code: string;
    flagImage?: string;
}

interface CountrySelectorProps {
    countries: Country[];
}

export default function CountrySelector({ countries }: CountrySelectorProps) {
    const router = useRouter();
    const { countryCode, setCountry } = useCountry();

    // Map context countryCode to country ID/Value
    // We want the dropdown to value by "Code" or "ID"?
    // Context uses Code. Url uses ID?
    // "router.push(`/search?country=${countryId}`)" uses ID.
    // So we should value by ID.
    const selectedCountry = countries.find(c => c.code === countryCode);
    const value = selectedCountry?.id || "";

    const options = countries.map(c => ({
        id: c.id,
        label: c.name,
        value: c.id,
        image: c.flagImage ? getImageUrl(c.flagImage) : undefined
    }));

    const handleChange = (countryId: string) => {
        const country = countries.find(c => c.id === countryId);
        if (country) {
            // We need to pass flagImage to setCountry if we update Context
            const image = country.flagImage ? getImageUrl(country.flagImage) : undefined;
            setCountry(country.code, country.name, country.id, image);
            router.push(`/search?country=${countryId}`);
        }
    };

    return (
        <div className="w-full max-w-xs">
            <ModernDropdown
                options={options}
                value={value}
                onChange={handleChange}
                placeholder="Select a country"
                label="Region"
            />
        </div>
    );
}
