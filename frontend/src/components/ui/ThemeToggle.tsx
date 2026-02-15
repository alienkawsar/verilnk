'use client';

import { useTheme } from '@/context/ThemeContext';
import { Moon, Sun } from 'lucide-react';
import { useState, useEffect } from 'react';

type ThemeToggleProps = {
    onToggle?: () => void;
};

export const ThemeToggle = ({ onToggle }: ThemeToggleProps) => {
    const { setTheme, resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    // Prevent hydration mismatch
    useEffect(() => setMounted(true), []);

    if (!mounted) {
        // Return a stable placeholder of the same size
        return (
            <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 opacity-50" />
        );
    }

    const toggleTheme = () => {
        setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
        onToggle?.();
    };

    return (
        <button
            onClick={toggleTheme}
            className="relative w-9 h-9 rounded-full flex items-center justify-center bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            title={`Switch to ${resolvedTheme === 'dark' ? 'Light' : 'Dark'} Mode`}
            aria-label="Toggle Theme"
        >
            <Sun
                className={`absolute w-5 h-5 text-yellow-500 transition-all duration-300 ease-in-out ${resolvedTheme === 'light'
                    ? 'scale-100 opacity-100 rotate-0'
                    : 'scale-0 opacity-0 -rotate-90'
                    }`}
            />
            <Moon
                className={`absolute w-5 h-5 text-blue-500 transition-all duration-300 ease-in-out ${resolvedTheme === 'dark'
                    ? 'scale-100 opacity-100 rotate-0'
                    : 'scale-0 opacity-0 rotate-90'
                    }`}
            />
        </button>
    );
};
