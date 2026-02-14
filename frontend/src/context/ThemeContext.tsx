'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    resolvedTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
    const [theme, setThemeState] = useState<Theme>('system');
    const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('dark');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMounted(true);
        // Load saved theme
        const saved = localStorage.getItem('theme') as Theme;
        if (saved) setThemeState(saved);
    }, []);

    // Use useLayoutEffect to apply theme before paint to avoid FOUC
    const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect;

    useIsomorphicLayoutEffect(() => {
        if (!mounted) return;

        const root = window.document.documentElement;
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

        const effectiveTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setResolvedTheme(effectiveTheme);

        // Apply class immediately
        if (effectiveTheme === 'dark') {
            root.classList.add('dark');
            root.style.colorScheme = 'dark';
        } else {
            root.classList.remove('dark');
            root.style.colorScheme = 'light';
        }

        if (theme !== 'system') {
            localStorage.setItem('theme', theme);
        } else {
            localStorage.removeItem('theme');
        }

    }, [theme, mounted]);

    // Handle system changes if in system mode
    useEffect(() => {
        if (theme !== 'system') return;

        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = () => {
            const newTheme = media.matches ? 'dark' : 'light';
            setResolvedTheme(newTheme);
            if (newTheme === 'dark') {
                document.documentElement.classList.add('dark');
                document.documentElement.style.colorScheme = 'dark';
            } else {
                document.documentElement.classList.remove('dark');
                document.documentElement.style.colorScheme = 'light';
            }
        };

        media.addEventListener('change', handleChange);
        return () => media.removeEventListener('change', handleChange);
    }, [theme]);


    return (
        <ThemeContext.Provider value={{ theme, setTheme: setThemeState, resolvedTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) throw new Error('useTheme must be used within a ThemeProvider');
    return context;
};
