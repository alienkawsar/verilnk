import { useState, useRef, useCallback, useEffect } from 'react';
import { api } from '@/lib/api';
import { audioProcessor } from '@/utils/audioProcessor';
import { normalizeVoiceTranscript } from '@/config/voiceNormalization';

// Polyfill types for Web Speech API
interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start: () => void;
    stop: () => void;
    abort: () => void;
    onresult: (event: any) => void;
    onerror: (event: any) => void;
    onend: (event: any) => void;
    onspeechend?: (event: any) => void;
}

export const useSpeechRecognition = () => {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [isSupported, setIsSupported] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [mode, setMode] = useState<'native' | 'fallback'>('native');
    const [activeProvider, setActiveProvider] = useState<'webspeech' | 'wasm' | 'googlecloud' | 'none'>('none');
    const [showPrivacyNotice, setShowPrivacyNotice] = useState(false);
    const [cloudAvailable, setCloudAvailable] = useState(false);
    const [cloudChecked, setCloudChecked] = useState(false);
    const [nativeUnstable, setNativeUnstable] = useState(false);

    const MAX_LISTEN_MS = 10000;
    const FALLBACK_SILENCE_MS = 1500;
    const FALLBACK_GRACE_MS = 400;
    const NATIVE_FINAL_SILENCE_MS = 1200;
    const NATIVE_INTERIM_SILENCE_MS = 2500;

    // Refs
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const clickDebounceRef = useRef<NodeJS.Timeout | null>(null);
    const watchdogTimerRef = useRef<NodeJS.Timeout | null>(null);
    const maxListenTimerRef = useRef<NodeJS.Timeout | null>(null);
    const nativeSilenceTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Silence Detection Refs
    const silenceStartRef = useRef<number | null>(null);
    const hasSpokenRef = useRef<boolean>(false);
    const animationFrameRef = useRef<number | null>(null);

    const processingRef = useRef<boolean>(false);
    const manualStopRef = useRef<boolean>(false);
    const fallbackQueuedRef = useRef<boolean>(false);
    const lastTranscriptRef = useRef<string>('');
    const listeningRef = useRef<boolean>(false);
    const cloudAvailableRef = useRef<boolean>(false);
    const cloudCheckedRef = useRef<boolean>(false);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (SpeechRecognition && !nativeUnstable) {
                const recognition = new SpeechRecognition();
                recognition.continuous = false; // Stop after one sentence
                recognition.interimResults = true;
                recognition.lang = 'en-US';
                recognitionRef.current = recognition;
                setIsSupported(true);
            } else if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
                setIsSupported(true);
                setMode('fallback');
            } else {
                setIsSupported(false);
                setError('Voice input not supported on this browser.');
            }
        }
        audioProcessor.load().catch(console.error);

        const checkProvider = async () => {
            try {
                const response = await api.get('/speech/provider');
                if (response.data?.googleCloud === true) {
                    setCloudAvailable(true);
                    cloudAvailableRef.current = true;
                }
            } catch (err) {
                // Silently ignore - fallback will handle if unavailable
            } finally {
                setCloudChecked(true);
                cloudCheckedRef.current = true;
            }
        };

        checkProvider();

        return () => stopAll();
    }, [nativeUnstable]);

    const stopAll = useCallback(() => {
        listeningRef.current = false;
        setShowPrivacyNotice(false);
        setActiveProvider('none');
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close().catch(console.error);
            audioContextRef.current = null;
        }
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch (e) { /* ignore */ }
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
        if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
        if (maxListenTimerRef.current) clearTimeout(maxListenTimerRef.current);
        if (nativeSilenceTimerRef.current) clearTimeout(nativeSilenceTimerRef.current);
    }, []);

    // --- Fallback (MediaRecorder) Logic ---
    const stopFallback = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }

        listeningRef.current = false;
        setIsListening(false);

        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }

        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close().catch(console.error);
            audioContextRef.current = null;
        }

        if (maxListenTimerRef.current) {
            clearTimeout(maxListenTimerRef.current);
            maxListenTimerRef.current = null;
        }
    }, []);

    const stopListening = useCallback(() => {
        manualStopRef.current = true;
        if (mode === 'native') {
            recognitionRef.current?.stop();
        } else {
            stopFallback();
        }
    }, [mode, stopFallback]);

    const setListeningState = (value: boolean) => {
        listeningRef.current = value;
        setIsListening(value);
    };

    const clearNativeTimers = () => {
        if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
        if (nativeSilenceTimerRef.current) clearTimeout(nativeSilenceTimerRef.current);
        if (maxListenTimerRef.current) clearTimeout(maxListenTimerRef.current);
        watchdogTimerRef.current = null;
        nativeSilenceTimerRef.current = null;
        maxListenTimerRef.current = null;
    };

    const ensureCloudAvailability = async () => {
        if (cloudCheckedRef.current) return cloudAvailableRef.current;

        try {
            const response = await api.get('/speech/provider');
            const available = response.data?.googleCloud === true;
            setCloudAvailable(available);
            setCloudChecked(true);
            cloudAvailableRef.current = available;
            cloudCheckedRef.current = true;
            return available;
        } catch (err) {
            setCloudChecked(true);
            cloudCheckedRef.current = true;
            return false;
        }
    };

    const getFallbackProvider = (available: boolean) => {
        if (available) return 'googlecloud';
        return 'wasm';
    };

    const queueFallbackStart = (reason: string) => {
        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
            setIsSupported(false);
            setError('Voice input not supported on this browser.');
            setListeningState(false);
            return;
        }

        if (fallbackQueuedRef.current) return;
        fallbackQueuedRef.current = true;
        setMode('fallback');
        setNativeUnstable(true);
        setError(null);

        setTimeout(async () => {
            if (!listeningRef.current) {
                // If listening ended, do not start fallback
                fallbackQueuedRef.current = false;
                return;
            }
            const available = await ensureCloudAvailability();
            startFallback(getFallbackProvider(available));
            fallbackQueuedRef.current = false;
        }, FALLBACK_GRACE_MS);
    };

    // --- Native Web Speech API Logic ---
    const startNative = useCallback(() => {
        if (!recognitionRef.current) return;

        setError(null);
        setTranscript('');
        lastTranscriptRef.current = '';
        manualStopRef.current = false;

        const recognition = recognitionRef.current;
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        clearNativeTimers();

        // Max listen duration safeguard
        maxListenTimerRef.current = setTimeout(() => {
            stopListening();
        }, MAX_LISTEN_MS);

        recognition.onresult = (event: any) => {
            // Activity detected - Reset Silence Timers
            if (nativeSilenceTimerRef.current) clearTimeout(nativeSilenceTimerRef.current);

            // Determine if the latest result is final
            let isFinal = false;
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    isFinal = true;
                    break;
                }
            }

            // SMART SILENCE DETECTION:
            // If Final: User likely finished a sentence -> Short timeout (1.2s)
            // If Interim: User is still speaking/pausing -> Long timeout (3s)
            const timeoutDuration = isFinal ? NATIVE_FINAL_SILENCE_MS : NATIVE_INTERIM_SILENCE_MS;

            nativeSilenceTimerRef.current = setTimeout(() => {
                stopListening();
            }, timeoutDuration);

            // Rebuild full transcript
            let fullTranscript = '';
            for (let i = 0; i < event.results.length; ++i) {
                fullTranscript += event.results[i][0].transcript;
            }

            if (fullTranscript) {
                lastTranscriptRef.current = fullTranscript;
                if (isFinal) {
                    setTranscript(normalizeVoiceTranscript(fullTranscript));
                }
            }
        };

        // Explicitly handle speech end
        recognition.onspeechend = () => {
            recognition.stop();
        };

        recognition.onerror = (event: any) => {
            console.error('Native Speech Error:', event.error);
            if (event.error === 'not-allowed') {
                setError('Microphone access denied.');
                setListeningState(false);
            } else if (event.error === 'network') {
                setError('Network error. Switching voice engine.');
                queueFallbackStart('network');
            } else if (event.error === 'no-speech') {
                if (!lastTranscriptRef.current && !manualStopRef.current) {
                    queueFallbackStart('no-speech');
                } else {
                    setListeningState(false);
                }
            } else if (event.error === 'service-not-allowed' || event.error === 'audio-capture') {
                setError('Voice engine unavailable. Switching.');
                queueFallbackStart(event.error);
            } else if (event.error === 'aborted') {
                setListeningState(false);
            }
        };

        recognition.onend = () => {
            clearNativeTimers();
            if (fallbackQueuedRef.current) {
                return;
            }
            const finalText = lastTranscriptRef.current;
            if (!finalText && !manualStopRef.current && !fallbackQueuedRef.current) {
                queueFallbackStart('empty');
                return;
            }
            if (finalText) {
                setTranscript(normalizeVoiceTranscript(finalText));
            }
            setListeningState(false);
            setShowPrivacyNotice(false);
            setActiveProvider('none');
        };

        try {
            recognition.start();
            setListeningState(true);
            setActiveProvider('webspeech');
            setShowPrivacyNotice(false);
        } catch (e) {
            console.error('Native start failed:', e);
            // If already started, we might get an error, just ignore or restart
            // But usually this means we should fall back or reset
            setListeningState(false);
            queueFallbackStart('start-failed');
        }
    }, [cloudAvailable, stopListening]);

    const detectSilence = () => {
        if (!analyserRef.current || !isListening) return;

        const bufferLength = analyserRef.current.fftSize;
        const dataArray = new Uint8Array(bufferLength);
        analyserRef.current.getByteTimeDomainData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            const x = (dataArray[i] - 128) / 128.0;
            sum += x * x;
        }
        const rms = Math.sqrt(sum / bufferLength);
        const db = 20 * Math.log10(rms);

        // Refined Thresholds for Noisy Environments
        const SILENCE_THRESHOLD_DB = -38;
        const SILENCE_DURATION_MS = FALLBACK_SILENCE_MS;
        const SPEAKING_THRESHOLD_DB = -28;

        if (db > SPEAKING_THRESHOLD_DB) {
            hasSpokenRef.current = true;
            silenceStartRef.current = null;
        } else if (db < SILENCE_THRESHOLD_DB) {
            if (hasSpokenRef.current) {
                if (silenceStartRef.current === null) {
                    silenceStartRef.current = performance.now();
                } else {
                    const duration = performance.now() - silenceStartRef.current;
                    if (duration > SILENCE_DURATION_MS) {
                        stopFallback();
                        return;
                    }
                }
            }
        } else {
            silenceStartRef.current = null;
        }

        animationFrameRef.current = requestAnimationFrame(detectSilence);
    };

    const startFallback = useCallback(async (provider: 'wasm' | 'googlecloud') => {
        if (processingRef.current) return;

        try {
            setError(null);
            setTranscript('');
            chunksRef.current = [];
            hasSpokenRef.current = false;
            silenceStartRef.current = null;
            manualStopRef.current = false;

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            let mimeType = 'audio/webm';
            if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                mimeType = 'audio/webm;codecs=opus';
            }

            const mediaRecorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = mediaRecorder;
            const resolvedProvider = provider === 'googlecloud' && cloudAvailable ? 'googlecloud' : 'wasm';
            setActiveProvider(resolvedProvider);
            setShowPrivacyNotice(resolvedProvider === 'googlecloud');

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                processingRef.current = true;
                setIsProcessing(true);
                const blob = new Blob(chunksRef.current, { type: mimeType });

                if (blob.size < 1000) {
                    setIsProcessing(false);
                    processingRef.current = false;
                    setShowPrivacyNotice(false);
                    setActiveProvider('none');
                    return;
                }

                try {
                    const processWithWasm = async () => {
                        setActiveProvider('wasm');
                        const processedBlob = await audioProcessor.process(blob);

                        const formData = new FormData();
                        formData.append('audio', processedBlob, 'input.wav');

                        const response = await api.post('/speech/recognize', formData, {
                            headers: { 'Content-Type': 'multipart/form-data' }
                        });

                        if (response.data?.text) {
                            setTranscript(normalizeVoiceTranscript(response.data.text));
                        }
                    };

                    if (resolvedProvider === 'googlecloud') {
                        try {
                            const formData = new FormData();
                            formData.append('audio', blob, 'input.webm');

                            const response = await api.post('/speech/transcribe', formData, {
                                headers: { 'Content-Type': 'multipart/form-data' }
                            });

                            if (response.data?.text) {
                                setTranscript(normalizeVoiceTranscript(response.data.text));
                            }
                        } catch (err: any) {
                            const status = err?.response?.status;
                            if (status === 501 || status === 404) {
                                await processWithWasm();
                            } else {
                                throw err;
                            }
                        }
                    } else {
                        await processWithWasm();
                    }
                } catch (err: any) {
                    console.error('Fallback processing failed:', err);
                    setError('Voice input couldn’t be processed. Please try again.');
                } finally {
                    setIsProcessing(false);
                    processingRef.current = false;
                    setShowPrivacyNotice(false);
                    setActiveProvider('none');
                }
            };

            mediaRecorder.start();
            setListeningState(true);

            if (maxListenTimerRef.current) clearTimeout(maxListenTimerRef.current);
            maxListenTimerRef.current = setTimeout(() => {
                stopFallback();
            }, MAX_LISTEN_MS);

            try {
                const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                audioContextRef.current = audioContext;
                const source = audioContext.createMediaStreamSource(stream);
                sourceRef.current = source;
                const analyser = audioContext.createAnalyser();
                analyser.fftSize = 2048;
                analyser.smoothingTimeConstant = 0.8;
                analyserRef.current = analyser;
                source.connect(analyser);
                detectSilence();
            } catch (e) {
                console.warn('Silence detection setup failed:', e);
            }

        } catch (err) {
            console.error(err);
            setError('Microphone access denied.');
            setListeningState(false);
        }
    }, [cloudAvailable, stopFallback]);

    // Main Toggle Function with Debounce
    const startListening = useCallback(async () => {
        // Prevent rapid clicks
        if (clickDebounceRef.current) return;
        clickDebounceRef.current = setTimeout(() => { clickDebounceRef.current = null; }, 500);

        if (!isSupported || isListening || isProcessing) return;

        if (mode === 'native') {
            startNative();
        } else {
            const available = await ensureCloudAvailability();
            startFallback(getFallbackProvider(available));
        }
    }, [isSupported, isListening, isProcessing, mode, startNative, startFallback]);

    const resetTranscript = useCallback(() => setTranscript(''), []);

    return {
        isListening,
        transcript,
        startListening,
        stopListening,
        resetTranscript,
        isSupported,
        error,
        isProcessing,
        mode,
        activeProvider,
        showPrivacyNotice,
        cloudAvailable,
        cloudChecked
    };
};
