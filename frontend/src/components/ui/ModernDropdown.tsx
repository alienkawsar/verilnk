'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { ChevronDown, Check } from 'lucide-react';

interface Option {
    id: string;
    label: string;
    value: string;
    image?: string; // For flags
}

interface ModernDropdownProps {
    options: Option[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    label?: string;
    disabled?: boolean;
}

export default function ModernDropdown({
    options,
    value,
    onChange,
    placeholder = 'Select an option',
    className = '',
    label,
    disabled = false
}: ModernDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find(opt => opt.value === value);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (option: Option) => {
        onChange(option.value);
        setIsOpen(false);
    };

    return (
        <div className={`relative ${className}`} ref={dropdownRef}>
            {label && <label className="block text-sm font-medium text-slate-400 mb-1">{label}</label>}
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={`w-full flex items-center justify-between surface-card rounded-xl px-4 py-3 text-[var(--app-text-primary)] transition-all focus:outline-none focus:ring-2 focus:ring-[#187DE9]/50 ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-slate-400 dark:hover:border-slate-500 active:bg-black/5 dark:active:bg-white/5'
                    }`}
            >
                <div className="flex items-center gap-3 truncate">
                    {selectedOption ? (
                        <>
                            {selectedOption.image && (
                                <Image
                                    src={selectedOption.image}
                                    alt=""
                                    width={20}
                                    height={20}
                                    className="w-5 h-5 rounded-full object-cover"
                                />
                            )}
                            <span className="truncate">{selectedOption.label}</span>
                        </>
                    ) : (
                        <span className="text-slate-500 dark:text-slate-400">{placeholder}</span>
                    )}
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute z-50 w-full mt-2 surface-card rounded-xl shadow-2xl max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2">
                    <div className="p-1">
                        {options.length === 0 ? (
                            <div className="px-4 py-3 text-sm text-[var(--app-text-secondary)] text-center">No options available</div>
                        ) : (
                            options.map((option) => (
                                <button
                                    key={option.id}
                                    onClick={() => handleSelect(option)}
                                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors ${option.value === value
                                        ? 'bg-[#187DE9] text-white'
                                        : 'text-[var(--app-text-primary)] hover:bg-black/5 dark:hover:bg-white/5'
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        {option.image && (
                                            <Image
                                                src={option.image}
                                                alt=""
                                                width={20}
                                                height={20}
                                                className="w-5 h-5 rounded-full object-cover bg-slate-100 dark:bg-slate-800"
                                            />
                                        )}
                                        <span>{option.label}</span>
                                    </div>
                                    {option.value === value && <Check className="w-4 h-4" />}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
