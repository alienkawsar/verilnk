import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

// Helper to convert ISO code to flag emoji
export function getFlagEmoji(countryCode: string) {
    if (!countryCode || countryCode === 'Global') return '🌐';
    const codePoints = countryCode
        .toUpperCase()
        .split('')
        .map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
}

// Helper to get full image URL
export function getImageUrl(path: string | undefined | null) {
    if (!path) return '';
    if (path.startsWith('http')) {
        try {
            const url = new URL(path);
            if (url.pathname.startsWith('/uploads/')) {
                return `${url.pathname}${url.search || ''}`;
            }
        } catch {
            // fall through
        }
        return path;
    }
    if (path.startsWith('/uploads/')) return path;
    // Assuming backend runs on localhost:8000
    const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:8000';

    // Remove leading slash if present
    const cleanPath = path.startsWith('/') ? path.substring(1) : path;

    return `${baseUrl}/${cleanPath}`;
}

// Helper to get initials from user details
export function getInitials(firstName?: string, lastName?: string, name?: string, email?: string): string {
    if (firstName && lastName) {
        return `${firstName[0]}${lastName[0]}`.toUpperCase();
    }
    if (name) {
        const parts = name.trim().split(' ');
        if (parts.length >= 2) {
            return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    }
    if (email) {
        return email.substring(0, 2).toUpperCase();
    }
    return '??';
}
