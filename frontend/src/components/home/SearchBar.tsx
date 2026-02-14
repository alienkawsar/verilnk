'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Mic, Loader2, Square } from 'lucide-react';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';

import { useCountry } from '@/context/CountryContext';

export default function SearchBar({ stateId }: { stateId?: string }) {
    const [query, setQuery] = useState('');
    const router = useRouter();
    const { countryId, countryCode } = useCountry();
    const { isListening, transcript, startListening, stopListening, isSupported, resetTranscript, isProcessing, error, showPrivacyNotice } = useSpeechRecognition();
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-update query when transcript changes
    useEffect(() => {
        if (transcript) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setQuery(transcript);
            resetTranscript();
            inputRef.current?.focus();
        }
    }, [transcript, resetTranscript]);

    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSearch = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (isSubmitting || !query.trim()) return;

        setIsSubmitting(true);
        const params = new URLSearchParams();
        params.set('q', query.trim());
        if (countryCode && countryCode !== 'Global') params.set('country', countryCode); // STRICT: Use Code
        if (stateId) params.set('state', stateId); // Pass State ID as 'state' param

        router.push(`/search?${params.toString()}`);
        setTimeout(() => setIsSubmitting(false), 2000); // Reset after navigation delay
    };

    const handleVoiceToggle = () => {
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    };

    return (
        <form onSubmit={handleSearch} className="w-full max-w-3xl relative">
            <div className={`group flex items-center gap-2 surface-card pl-4 pr-1.5 h-[52px] rounded-full shadow-lg hover:shadow-xl transition-all duration-300 ring-1 ring-black/5 dark:ring-white/5 focus-within:ring-2 focus-within:ring-[var(--btn-primary)] focus-within:border-[var(--btn-primary)] focus-within:shadow-[0_0_20px_rgba(24,125,233,0.3)] ${isListening ? 'ring-2 ring-red-500/50 border-red-500/50' : isProcessing ? 'ring-2 ring-blue-500/50 border-blue-500/50' : ''}`}>
                <div className="text-slate-400 group-focus-within:text-blue-500 dark:group-focus-within:text-blue-400 transition-colors">
                    <Search className="h-5 w-5" />
                </div>
                <input
                    type="text"
                    ref={inputRef}
                    className="flex-1 h-full bg-transparent border-none text-[var(--app-text-primary)] placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-0 px-2 text-base font-medium tracking-tight selection:bg-blue-500/30"
                    placeholder={isListening ? "Listening..." : isProcessing ? "Processing..." : "Search official websites securely…"}
                    aria-label="Search official websites"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />

                {/* Voice Input Button */}
                <button
                    type="button"
                    onClick={handleVoiceToggle}
                    disabled={!isSupported}
                    className={`h-9 w-9 flex items-center justify-center rounded-full transition-all ${!isSupported
                        ? 'text-slate-400 dark:text-slate-600 cursor-not-allowed'
                        : isListening
                            ? 'bg-red-500 text-white animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.4)]'
                            : 'text-slate-500 dark:text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-black/5 dark:hover:bg-white/5'
                        }`}
                    title={isListening ? "Stop recording" : "Search by voice"}
                    aria-label={isListening ? "Stop recording" : "Search by voice"}
                >
                    {isProcessing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isListening ? (
                        <Square className="h-3.5 w-3.5 fill-current" />
                    ) : (
                        <Mic className="h-5 w-5" />
                    )}
                </button>

                <button
                    type="submit"
                    className="h-10 w-10 btn-primary rounded-full transition-all shadow-md hover:shadow-lg flex items-center justify-center flex-shrink-0"
                    title="Search"
                    aria-label="Search"
                >
                    <Search className="h-5 w-5" />
                </button>
            </div>
            {showPrivacyNotice && (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Voice audio is sent for transcription.
                </p>
            )}
            {error && (
                <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                    {error}
                </p>
            )}
            {!isSupported && !error && (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Voice input not supported on this browser.
                </p>
            )}
        </form>
    );
}
