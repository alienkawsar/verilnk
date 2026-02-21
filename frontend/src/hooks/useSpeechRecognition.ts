import { useState, useRef, useCallback, useEffect } from 'react';
import { api } from '@/lib/api';
import { audioProcessor } from '@/utils/audioProcessor';
import { normalizeVoiceTranscript } from '@/config/voiceNormalization';
import { incrementVoiceMetric, recordVoiceOutcome, type VoiceOutcome, type VoiceProvider } from '@/lib/voiceTelemetry';
import { resolveVoiceInputMode, shouldSwitchToFallback } from '@/config/voiceFallbackPolicy';

// Polyfill types for Web Speech API
interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start: () => void;
    stop: () => void;
    abort: () => void;
    onstart?: (event: any) => void;
    onresult: (event: any) => void;
    onerror: (event: any) => void;
    onend: (event: any) => void;
    onaudioend?: (event: any) => void;
    onspeechend?: (event: any) => void;
}

type NativeRecognitionState = 'idle' | 'starting' | 'listening' | 'stopping';

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
    const FALLBACK_NO_SPEECH_GRACE_MS = 1500;
    const AUDIO_WARMUP_MS = 600;
    const FALLBACK_NO_SPEECH_RECHECK_MS = 800;
    const NATIVE_FINAL_SILENCE_MS = 1200;
    const NATIVE_INTERIM_SILENCE_MS = 2500;
    const NATIVE_NO_SPEECH_GRACE_MS = 900;
    const NATIVE_NO_SPEECH_RETRY_DELAY_MS = 300;
    const NATIVE_NO_SPEECH_MAX_RETRIES = 1;

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
    const nativeRetryTimerRef = useRef<NodeJS.Timeout | null>(null);
    const fallbackNoSpeechTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Silence Detection Refs
    const silenceStartRef = useRef<number | null>(null);
    const fallbackSessionStartRef = useRef<number | null>(null);
    const fallbackMaxListenElapsedRef = useRef<boolean>(false);
    const fallbackWarmupDoneRef = useRef<boolean>(false);
    const fallbackWarmupSamplesRef = useRef<number[]>([]);
    const fallbackNoSpeechExtendedRef = useRef<boolean>(false);
    const fallbackAudioContextReadyRef = useRef<boolean>(false);
    const baselineNoiseDbRef = useRef<number | null>(null);
    const energyThresholdDbRef = useRef<number>(-44);
    const speakingThresholdDbRef = useRef<number>(-35);
    const silenceThresholdDbRef = useRef<number>(-48);
    const maxDbSeenRef = useRef<number>(-120);
    const hasAudioEnergyRef = useRef<boolean>(false);
    const hasSpokenRef = useRef<boolean>(false);
    const animationFrameRef = useRef<number | null>(null);

    const processingRef = useRef<boolean>(false);
    const manualStopRef = useRef<boolean>(false);
    const fallbackQueuedRef = useRef<boolean>(false);
    const lastTranscriptRef = useRef<string>('');
    const listeningRef = useRef<boolean>(false);
    const cloudAvailableRef = useRef<boolean>(false);
    const cloudCheckedRef = useRef<boolean>(false);
    const nativeStateRef = useRef<NativeRecognitionState>('idle');
    const nativeStartTimestampRef = useRef<number | null>(null);
    const nativeNoSpeechRetriesRef = useRef<number>(0);
    const lastNativeErrorRef = useRef<string | null>(null);
    const fallbackRequestSentRef = useRef<boolean>(false);
    const nativeInstabilityCountRef = useRef<number>(0);

    const setNativeState = (state: NativeRecognitionState) => {
        nativeStateRef.current = state;
    };

    const debugNative = useCallback((event: string, details: Record<string, unknown> = {}) => {
        if (process.env.NODE_ENV !== 'development') return;
        console.info('[voice/native]', {
            event,
            state: nativeStateRef.current,
            ...details
        });
    }, []);

    const clamp = (value: number, min: number, max: number) => {
        return Math.max(min, Math.min(max, value));
    };

    const median = (values: number[]) => {
        if (!values.length) return -60;
        const sorted = [...values].sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        if (sorted.length % 2 === 0) {
            return (sorted[middle - 1] + sorted[middle]) / 2;
        }
        return sorted[middle];
    };

    const getSessionDurationMs = useCallback((provider: VoiceProvider) => {
        const startedAt = provider === 'webspeech'
            ? nativeStartTimestampRef.current
            : fallbackSessionStartRef.current;
        return startedAt ? Date.now() - startedAt : 0;
    }, []);

    const trackVoiceOutcome = useCallback((params: {
        provider: VoiceProvider;
        outcome: VoiceOutcome;
        energyDetected?: boolean;
        spokenDetected?: boolean;
    }) => {
        recordVoiceOutcome({
            provider: params.provider,
            outcome: params.outcome,
            energyDetected: params.energyDetected ?? hasAudioEnergyRef.current,
            spokenDetected: params.spokenDetected ?? hasSpokenRef.current,
            durationMs: getSessionDurationMs(params.provider)
        });
    }, [getSessionDurationMs]);

    const isSecureVoiceContext = useCallback(() => {
        if (typeof window === 'undefined') return false;
        const hostname = window.location.hostname;
        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
        return window.isSecureContext || isLocalhost;
    }, []);

    const getMicrophonePermissionState = useCallback(async (): Promise<PermissionState | null> => {
        if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
            return null;
        }

        try {
            const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
            return result.state;
        } catch {
            return null;
        }
    }, []);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            const fallbackSupported = Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
            const preferredMode = resolveVoiceInputMode({
                nativeSupported: Boolean(SpeechRecognition),
                nativeUnstable,
                fallbackSupported
            });

            if (preferredMode === 'native' && SpeechRecognition) {
                const recognition = new SpeechRecognition();
                recognition.continuous = false; // Stop after one sentence
                recognition.interimResults = true;
                recognition.lang = 'en-US';
                recognitionRef.current = recognition;
                setIsSupported(true);
                setMode('native');
            } else if (preferredMode === 'fallback' && fallbackSupported) {
                recognitionRef.current = null;
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
        setNativeState('idle');
        nativeStartTimestampRef.current = null;
        nativeNoSpeechRetriesRef.current = 0;
        lastNativeErrorRef.current = null;
        fallbackRequestSentRef.current = false;
        fallbackSessionStartRef.current = null;
        fallbackMaxListenElapsedRef.current = false;
        fallbackWarmupDoneRef.current = false;
        fallbackWarmupSamplesRef.current = [];
        fallbackNoSpeechExtendedRef.current = false;
        fallbackAudioContextReadyRef.current = false;
        baselineNoiseDbRef.current = null;
        energyThresholdDbRef.current = -44;
        speakingThresholdDbRef.current = -35;
        silenceThresholdDbRef.current = -48;
        maxDbSeenRef.current = -120;
        hasAudioEnergyRef.current = false;
        hasSpokenRef.current = false;
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
            try { recognitionRef.current.abort(); } catch (e) { /* ignore */ }
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
        if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
        if (maxListenTimerRef.current) clearTimeout(maxListenTimerRef.current);
        if (nativeSilenceTimerRef.current) clearTimeout(nativeSilenceTimerRef.current);
        if (nativeRetryTimerRef.current) clearTimeout(nativeRetryTimerRef.current);
        if (fallbackNoSpeechTimerRef.current) clearTimeout(fallbackNoSpeechTimerRef.current);
    }, []);

    // --- Fallback (MediaRecorder) Logic ---
    const stopFallback = useCallback(() => {
        const isRecording = mediaRecorderRef.current?.state === 'recording';
        if (isRecording) {
            mediaRecorderRef.current?.stop();
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

        if (fallbackNoSpeechTimerRef.current) {
            clearTimeout(fallbackNoSpeechTimerRef.current);
            fallbackNoSpeechTimerRef.current = null;
        }

        // Preserve session markers while MediaRecorder is stopping so onstop can classify outcome accurately.
        if (!isRecording) {
            fallbackSessionStartRef.current = null;
            fallbackMaxListenElapsedRef.current = false;
            fallbackWarmupDoneRef.current = false;
            fallbackWarmupSamplesRef.current = [];
            fallbackNoSpeechExtendedRef.current = false;
            fallbackAudioContextReadyRef.current = false;
            baselineNoiseDbRef.current = null;
            energyThresholdDbRef.current = -44;
            speakingThresholdDbRef.current = -35;
            silenceThresholdDbRef.current = -48;
            maxDbSeenRef.current = -120;
            hasAudioEnergyRef.current = false;
            hasSpokenRef.current = false;
            silenceStartRef.current = null;
        }
    }, []);

    const stopListening = useCallback(() => {
        manualStopRef.current = true;
        if (mode === 'native') {
            requestNativeStop('user');
        } else {
            stopFallback();
        }
    }, [mode, stopFallback]);

    const setListeningState = (value: boolean) => {
        listeningRef.current = value;
        setIsListening(value);
    };

    const clearNativeTimers = useCallback(() => {
        if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
        if (nativeSilenceTimerRef.current) clearTimeout(nativeSilenceTimerRef.current);
        if (maxListenTimerRef.current) clearTimeout(maxListenTimerRef.current);
        watchdogTimerRef.current = null;
        nativeSilenceTimerRef.current = null;
        maxListenTimerRef.current = null;
    }, []);

    const requestNativeStop = useCallback((reason: 'user' | 'auto') => {
        const recognition = recognitionRef.current;
        if (!recognition) {
            setNativeState('idle');
            setListeningState(false);
            return;
        }

        if (nativeStateRef.current === 'idle') {
            setListeningState(false);
            return;
        }

        if (nativeStateRef.current === 'stopping') {
            return;
        }

        setNativeState('stopping');
        clearNativeTimers();
        if (nativeRetryTimerRef.current) {
            clearTimeout(nativeRetryTimerRef.current);
            nativeRetryTimerRef.current = null;
        }

        try {
            if (reason === 'user') {
                recognition.abort();
            } else {
                recognition.stop();
            }
        } catch {
            setNativeState('idle');
            setListeningState(false);
        }
    }, [clearNativeTimers]);

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

        const nextInstabilityCount = (reason === 'start-failed' || reason === 'empty')
            ? nativeInstabilityCountRef.current + 1
            : nativeInstabilityCountRef.current;
        nativeInstabilityCountRef.current = nextInstabilityCount;

        if (!shouldSwitchToFallback({ reason, instabilityCount: nextInstabilityCount })) {
            debugNative('fallback-skipped', { reason, instabilityCount: nextInstabilityCount });
            setNativeState('idle');
            setListeningState(false);
            if (reason === 'start-failed' || reason === 'empty') {
                setError('Voice input couldn’t start. Try again.');
            }
            return;
        }

        if (fallbackQueuedRef.current) return;
        fallbackQueuedRef.current = true;
        setNativeState('idle');
        clearNativeTimers();
        if (nativeRetryTimerRef.current) {
            clearTimeout(nativeRetryTimerRef.current);
            nativeRetryTimerRef.current = null;
        }
        setMode('fallback');
        if (reason === 'start-failed' || reason === 'empty') {
            setNativeUnstable(true);
        }
        setError(null);
        debugNative('queue-fallback', { reason });

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
    const startNative = useCallback((isRetry = false) => {
        if (!recognitionRef.current) return;

        // Root cause: duplicate start() calls while the engine is booting can race and fail.
        if (nativeStateRef.current === 'starting' || nativeStateRef.current === 'listening') {
            debugNative('start-ignored', { reason: 'already-active' });
            return;
        }

        if (nativeStateRef.current === 'stopping') {
            debugNative('start-ignored', { reason: 'stopping' });
            return;
        }

        if (!isRetry) {
            setError(null);
            setTranscript('');
            lastTranscriptRef.current = '';
            nativeNoSpeechRetriesRef.current = 0;
        }

        if (nativeRetryTimerRef.current) {
            clearTimeout(nativeRetryTimerRef.current);
            nativeRetryTimerRef.current = null;
        }

        manualStopRef.current = false;
        lastNativeErrorRef.current = null;
        setNativeState('starting');
        setListeningState(true);
        setActiveProvider('webspeech');
        setShowPrivacyNotice(false);
        nativeStartTimestampRef.current = Date.now();

        const recognition = recognitionRef.current;
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        clearNativeTimers();

        // Max listen duration safeguard
        maxListenTimerRef.current = setTimeout(() => {
            requestNativeStop('auto');
        }, MAX_LISTEN_MS);

        recognition.onstart = () => {
            setNativeState('listening');
            nativeInstabilityCountRef.current = 0;
            debugNative('start', {
                retryAttempted: isRetry,
                retries: nativeNoSpeechRetriesRef.current
            });
        };

        recognition.onresult = (event: any) => {
            if (nativeSilenceTimerRef.current) clearTimeout(nativeSilenceTimerRef.current);

            let isFinal = false;
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    isFinal = true;
                    break;
                }
            }

            const timeoutDuration = isFinal ? NATIVE_FINAL_SILENCE_MS : NATIVE_INTERIM_SILENCE_MS;

            nativeSilenceTimerRef.current = setTimeout(() => {
                requestNativeStop('auto');
            }, timeoutDuration);

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

        recognition.onspeechend = () => {
            requestNativeStop('auto');
        };

        recognition.onaudioend = () => {
            debugNative('audio-end');
        };

        recognition.onerror = (event: any) => {
            const code = event?.error || 'unknown';
            lastNativeErrorRef.current = code;
            const elapsedMs = nativeStartTimestampRef.current
                ? Date.now() - nativeStartTimestampRef.current
                : null;

            if (code === 'no-speech') {
                const withinGraceWindow = typeof elapsedMs === 'number' && elapsedMs <= NATIVE_NO_SPEECH_GRACE_MS;
                const canRetry = !manualStopRef.current
                    && withinGraceWindow
                    && nativeNoSpeechRetriesRef.current < NATIVE_NO_SPEECH_MAX_RETRIES;

                // Root cause: browsers may emit `no-speech` quickly during mic warmup/focus changes.
                debugNative('no-speech', {
                    elapsedMs,
                    withinGraceWindow,
                    retryAttempted: nativeNoSpeechRetriesRef.current > 0,
                    canRetry
                });

                if (canRetry) {
                    nativeNoSpeechRetriesRef.current += 1;
                    lastNativeErrorRef.current = 'no-speech-retry';
                    setNativeState('idle');
                    setListeningState(false);
                    clearNativeTimers();
                    nativeRetryTimerRef.current = setTimeout(() => {
                        startNative(true);
                    }, NATIVE_NO_SPEECH_RETRY_DELAY_MS);
                    return;
                }

                setError('No speech detected. Try again.');
                incrementVoiceMetric('voice.no_speech');
                trackVoiceOutcome({
                    provider: 'webspeech',
                    outcome: 'no_speech',
                    energyDetected: false,
                    spokenDetected: Boolean(lastTranscriptRef.current)
                });
                lastNativeErrorRef.current = 'no-speech-handled';
                setNativeState('idle');
                setListeningState(false);
                setShowPrivacyNotice(false);
                setActiveProvider('none');
                return;
            }

            debugNative('error', {
                code,
                elapsedMs,
                retryAttempted: nativeNoSpeechRetriesRef.current > 0
            });

            if (code === 'not-allowed') {
                setError('Microphone access denied.');
                incrementVoiceMetric('voice.denied');
                trackVoiceOutcome({
                    provider: 'webspeech',
                    outcome: 'denied',
                    energyDetected: false,
                    spokenDetected: false
                });
                setNativeState('idle');
                setListeningState(false);
            } else if (code === 'network') {
                setError('Network error. Switching voice engine.');
                queueFallbackStart('network');
            } else if (code === 'service-not-allowed' || code === 'audio-capture') {
                setError('Voice engine unavailable. Switching.');
                queueFallbackStart(code);
            } else if (code === 'aborted') {
                setNativeState('idle');
                setListeningState(false);
            } else {
                setError('Voice recognition failed. Please try again.');
                trackVoiceOutcome({
                    provider: 'webspeech',
                    outcome: 'error',
                    energyDetected: false,
                    spokenDetected: false
                });
                setNativeState('idle');
                setListeningState(false);
            }
        };

        recognition.onend = () => {
            clearNativeTimers();

            if (fallbackQueuedRef.current) {
                return;
            }

            const finalText = lastTranscriptRef.current.trim();
            const nativeError = lastNativeErrorRef.current;

            setNativeState('idle');
            setListeningState(false);
            setShowPrivacyNotice(false);
            setActiveProvider('none');

            if (finalText) {
                incrementVoiceMetric('voice.success');
                trackVoiceOutcome({
                    provider: 'webspeech',
                    outcome: 'success',
                    energyDetected: true,
                    spokenDetected: true
                });
                setTranscript(normalizeVoiceTranscript(finalText));
                return;
            }

            if (nativeError === 'aborted') {
                return;
            }

            if (nativeError === 'no-speech-retry') {
                return;
            }

            if (nativeError === 'no-speech') {
                incrementVoiceMetric('voice.no_speech');
                trackVoiceOutcome({
                    provider: 'webspeech',
                    outcome: 'no_speech',
                    energyDetected: false,
                    spokenDetected: false
                });
                setError('No speech detected. Try again.');
            }
        };

        try {
            recognition.start();
        } catch (e: any) {
            debugNative('start-failed', {
                name: e?.name || 'unknown',
                message: e?.message || 'unknown'
            });
            setNativeState('idle');
            setListeningState(false);

            if (e?.name === 'InvalidStateError') {
                return;
            }

            queueFallbackStart('start-failed');
        }
    }, [clearNativeTimers, queueFallbackStart, requestNativeStop, trackVoiceOutcome]);

    const scheduleFallbackNoSpeechCheck = useCallback((delayMs = FALLBACK_NO_SPEECH_GRACE_MS) => {
        if (fallbackNoSpeechTimerRef.current) {
            clearTimeout(fallbackNoSpeechTimerRef.current);
        }

        fallbackNoSpeechTimerRef.current = setTimeout(() => {
            fallbackNoSpeechTimerRef.current = null;

            if (mediaRecorderRef.current?.state !== 'recording') return;

            // If AudioContext never reaches running state, avoid early stop and let MAX_LISTEN_MS end the session.
            if (!fallbackAudioContextReadyRef.current) return;

            if (!fallbackWarmupDoneRef.current) {
                if (!fallbackNoSpeechExtendedRef.current) {
                    fallbackNoSpeechExtendedRef.current = true;
                    scheduleFallbackNoSpeechCheck(FALLBACK_NO_SPEECH_RECHECK_MS);
                }
                return;
            }

            if (!hasAudioEnergyRef.current) {
                stopFallback();
            }
        }, delayMs);
    }, [stopFallback]);

    const detectSilence = () => {
        if (!analyserRef.current || !listeningRef.current) return;

        const bufferLength = analyserRef.current.fftSize;
        const dataArray = new Uint8Array(bufferLength);
        analyserRef.current.getByteTimeDomainData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            const x = (dataArray[i] - 128) / 128.0;
            sum += x * x;
        }
        const rms = Math.sqrt(sum / bufferLength);
        const db = 20 * Math.log10(Math.max(rms, 1e-8));
        if (db > maxDbSeenRef.current) {
            maxDbSeenRef.current = db;
        }

        const sessionStartMs = fallbackSessionStartRef.current;
        const warmupElapsedMs = sessionStartMs ? Date.now() - sessionStartMs : 0;
        const SILENCE_DURATION_MS = FALLBACK_SILENCE_MS;

        if (!fallbackWarmupDoneRef.current) {
            fallbackWarmupSamplesRef.current.push(db);

            if (warmupElapsedMs >= AUDIO_WARMUP_MS) {
                const baselineNoiseDb = median(fallbackWarmupSamplesRef.current);
                baselineNoiseDbRef.current = baselineNoiseDb;
                energyThresholdDbRef.current = clamp(baselineNoiseDb + 6, -60, -38);
                speakingThresholdDbRef.current = clamp(baselineNoiseDb + 10, -55, -32);
                silenceThresholdDbRef.current = clamp(baselineNoiseDb + 3, -65, -42);
                fallbackWarmupDoneRef.current = true;

                if (!hasAudioEnergyRef.current) {
                    scheduleFallbackNoSpeechCheck(FALLBACK_NO_SPEECH_GRACE_MS);
                }
            }

            animationFrameRef.current = requestAnimationFrame(detectSilence);
            return;
        }

        if (db > energyThresholdDbRef.current) {
            hasAudioEnergyRef.current = true;
            if (fallbackNoSpeechTimerRef.current) {
                clearTimeout(fallbackNoSpeechTimerRef.current);
                fallbackNoSpeechTimerRef.current = null;
            }
        }

        if (db > speakingThresholdDbRef.current) {
            hasSpokenRef.current = true;
            silenceStartRef.current = null;
        } else if (db < silenceThresholdDbRef.current) {
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
            hasAudioEnergyRef.current = false;
            hasSpokenRef.current = false;
            silenceStartRef.current = null;
            fallbackSessionStartRef.current = null;
            fallbackMaxListenElapsedRef.current = false;
            fallbackWarmupDoneRef.current = false;
            fallbackWarmupSamplesRef.current = [];
            fallbackNoSpeechExtendedRef.current = false;
            fallbackAudioContextReadyRef.current = false;
            baselineNoiseDbRef.current = null;
            energyThresholdDbRef.current = -44;
            speakingThresholdDbRef.current = -35;
            silenceThresholdDbRef.current = -48;
            maxDbSeenRef.current = -120;
            manualStopRef.current = false;
            fallbackRequestSentRef.current = false;

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            streamRef.current = stream;

            const userAgent = (typeof navigator !== 'undefined' ? navigator.userAgent : '').toLowerCase();
            const isFirefox = userAgent.includes('firefox');
            const isSafari = userAgent.includes('safari')
                && !userAgent.includes('chrome')
                && !userAgent.includes('crios')
                && !userAgent.includes('android')
                && !userAgent.includes('edg');

            const mimeTypeCandidates = isFirefox
                ? [
                    'audio/ogg;codecs=opus',
                    'audio/webm;codecs=opus',
                    'audio/ogg',
                    'audio/webm',
                    'audio/mp4'
                ]
                : isSafari
                    ? [
                        'audio/mp4',
                        'audio/webm;codecs=opus',
                        'audio/ogg;codecs=opus',
                        'audio/webm',
                        'audio/ogg'
                    ]
                    : [
                        'audio/webm;codecs=opus',
                        'audio/ogg;codecs=opus',
                        'audio/webm',
                        'audio/ogg',
                        'audio/mp4'
                    ];
            const selectedMimeType = (typeof MediaRecorder.isTypeSupported === 'function')
                ? (mimeTypeCandidates.find(type => MediaRecorder.isTypeSupported(type)) ?? null)
                : null;
            const mediaRecorder = selectedMimeType
                ? new MediaRecorder(stream, { mimeType: selectedMimeType })
                : new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            const resolvedProvider = provider === 'googlecloud' && cloudAvailable ? 'googlecloud' : 'wasm';
            setActiveProvider(resolvedProvider);
            setShowPrivacyNotice(resolvedProvider === 'googlecloud');

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                const logFallbackDiagnostics = () => {
                    if (process.env.NODE_ENV !== 'development') return;
                    console.info('[voice/fallback-stop]', {
                        selectedMimeType,
                        rawBlobBytes: blob.size,
                        chunks: chunksRef.current.length,
                        baselineNoiseDb: baselineNoiseDbRef.current,
                        thresholds: {
                            energy: energyThresholdDbRef.current,
                            speaking: speakingThresholdDbRef.current,
                            silence: silenceThresholdDbRef.current
                        },
                        maxDbSeen: maxDbSeenRef.current,
                        energyDetected: hasAudioEnergyRef.current,
                        spokenDetected: hasSpokenRef.current,
                        provider: resolvedProvider
                    });
                };

                const finalizeFallbackSession = () => {
                    fallbackSessionStartRef.current = null;
                    fallbackMaxListenElapsedRef.current = false;
                    fallbackWarmupDoneRef.current = false;
                    fallbackWarmupSamplesRef.current = [];
                    fallbackNoSpeechExtendedRef.current = false;
                    fallbackAudioContextReadyRef.current = false;
                    baselineNoiseDbRef.current = null;
                    energyThresholdDbRef.current = -44;
                    speakingThresholdDbRef.current = -35;
                    silenceThresholdDbRef.current = -48;
                    maxDbSeenRef.current = -120;
                    hasAudioEnergyRef.current = false;
                    hasSpokenRef.current = false;
                    silenceStartRef.current = null;
                };

                if (fallbackNoSpeechTimerRef.current) {
                    clearTimeout(fallbackNoSpeechTimerRef.current);
                    fallbackNoSpeechTimerRef.current = null;
                }

                const blob = new Blob(chunksRef.current, { type: selectedMimeType || 'audio/webm' });

                logFallbackDiagnostics();

                if (!hasAudioEnergyRef.current) {
                    incrementVoiceMetric('voice.no_speech');
                    trackVoiceOutcome({
                        provider: resolvedProvider,
                        outcome: 'no_speech',
                        energyDetected: false,
                        spokenDetected: hasSpokenRef.current
                    });
                    setError('No speech detected. Try again.');
                    setIsProcessing(false);
                    processingRef.current = false;
                    setShowPrivacyNotice(false);
                    setActiveProvider('none');
                    finalizeFallbackSession();
                    return;
                }

                if (blob.size < 1000) {
                    trackVoiceOutcome({
                        provider: resolvedProvider,
                        outcome: 'error',
                        energyDetected: hasAudioEnergyRef.current,
                        spokenDetected: hasSpokenRef.current
                    });
                    setError('Voice input couldn’t be processed. Please try again.');
                    setIsProcessing(false);
                    processingRef.current = false;
                    setShowPrivacyNotice(false);
                    setActiveProvider('none');
                    finalizeFallbackSession();
                    return;
                }

                if (fallbackRequestSentRef.current) return;
                fallbackRequestSentRef.current = true;
                processingRef.current = true;
                setIsProcessing(true);
                let processingProvider: VoiceProvider = resolvedProvider === 'googlecloud' ? 'googlecloud' : 'wasm';

                try {
                    const handleTranscriptionResult = (payload: any, providerUsed: VoiceProvider) => {
                        const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
                        const reason = payload?.reason;
                        if (!text || reason === 'NO_SPEECH') {
                            if (!hasAudioEnergyRef.current || (fallbackMaxListenElapsedRef.current && !hasSpokenRef.current)) {
                                incrementVoiceMetric('voice.no_speech');
                                trackVoiceOutcome({
                                    provider: providerUsed,
                                    outcome: 'no_speech',
                                    energyDetected: hasAudioEnergyRef.current,
                                    spokenDetected: hasSpokenRef.current
                                });
                                setError('No speech detected. Try again.');
                                return;
                            }

                            trackVoiceOutcome({
                                provider: providerUsed,
                                outcome: 'error',
                                energyDetected: hasAudioEnergyRef.current,
                                spokenDetected: hasSpokenRef.current
                            });
                            setError('Voice input couldn’t be processed. Please try again.');
                            return;
                        }

                        incrementVoiceMetric('voice.success');
                        trackVoiceOutcome({
                            provider: providerUsed,
                            outcome: 'success',
                            energyDetected: hasAudioEnergyRef.current,
                            spokenDetected: hasSpokenRef.current
                        });
                        setTranscript(normalizeVoiceTranscript(text));
                    };

                    const processWithWasm = async () => {
                        processingProvider = 'wasm';
                        setActiveProvider('wasm');
                        const processedBlob = await audioProcessor.process(blob, selectedMimeType || blob.type);

                        const formData = new FormData();
                        formData.append('audio', processedBlob, 'input.wav');

                        const response = await api.post('/speech/recognize', formData, {
                            headers: { 'Content-Type': 'multipart/form-data' }
                        });

                        return response.data;
                    };

                    const processWithGoogle = async () => {
                        const extension = selectedMimeType?.includes('ogg')
                            ? 'ogg'
                            : selectedMimeType?.includes('mp4')
                                ? 'mp4'
                                : 'webm';
                        const formData = new FormData();
                        formData.append('audio', blob, `input.${extension}`);

                        const response = await api.post('/speech/transcribe', formData, {
                            headers: { 'Content-Type': 'multipart/form-data' }
                        });

                        return response.data;
                    };

                    if (resolvedProvider === 'googlecloud') {
                        try {
                            processingProvider = 'googlecloud';
                            const googlePayload = await processWithGoogle();
                            const googleText = typeof googlePayload?.text === 'string' ? googlePayload.text.trim() : '';
                            const googleReason = googlePayload?.reason;

                            // Google STT is primary, but if it returns empty while energy was detected,
                            // retry once with Whisper for the same session.
                            if ((!googleText || googleReason === 'NO_SPEECH') && hasAudioEnergyRef.current) {
                                if (process.env.NODE_ENV === 'development') {
                                    console.info('[voice/fallback-provider-switch]', {
                                        from: 'googlecloud',
                                        to: 'wasm',
                                        reason: 'empty-google-with-energy',
                                        selectedMimeType
                                    });
                                }
                                const wasmPayload = await processWithWasm();
                                handleTranscriptionResult(wasmPayload, 'wasm');
                            } else {
                                handleTranscriptionResult(googlePayload, 'googlecloud');
                            }
                        } catch (googleErr: any) {
                            const status = googleErr?.response?.status;

                            // Provider not available: disable cloud and use Whisper for this and future sessions.
                            if (status === 501 || status === 404) {
                                setCloudAvailable(false);
                                cloudAvailableRef.current = false;
                                setCloudChecked(true);
                                cloudCheckedRef.current = true;
                                const wasmPayload = await processWithWasm();
                                handleTranscriptionResult(wasmPayload, 'wasm');
                            } else {
                                // Google STT failed for this session; recover with Whisper without disabling cloud globally.
                                const wasmPayload = await processWithWasm();
                                handleTranscriptionResult(wasmPayload, 'wasm');
                            }
                        }
                    } else {
                        const wasmPayload = await processWithWasm();
                        handleTranscriptionResult(wasmPayload, 'wasm');
                    }
                } catch (err: any) {
                    console.error('Fallback processing failed:', err);
                    const status = err?.response?.status;
                    const apiError = err?.response?.data?.error;
                    const errorProvider: VoiceProvider = processingProvider;

                    if (status === 400 && (apiError === 'NO_AUDIO' || apiError === 'TOO_SHORT')) {
                        if (!hasAudioEnergyRef.current || (fallbackMaxListenElapsedRef.current && !hasSpokenRef.current)) {
                            incrementVoiceMetric('voice.no_speech');
                            trackVoiceOutcome({
                                provider: errorProvider,
                                outcome: 'no_speech',
                                energyDetected: hasAudioEnergyRef.current,
                                spokenDetected: hasSpokenRef.current
                            });
                            setError('No speech detected. Try again.');
                        } else {
                            trackVoiceOutcome({
                                provider: errorProvider,
                                outcome: 'error',
                                energyDetected: hasAudioEnergyRef.current,
                                spokenDetected: hasSpokenRef.current
                            });
                            setError('Voice input was too short. Try speaking a little longer.');
                        }
                    } else if (status === 400 && apiError === 'INVALID_AUDIO_FORMAT') {
                        incrementVoiceMetric('voice.invalid_audio');
                        trackVoiceOutcome({
                            provider: errorProvider,
                            outcome: 'error',
                            energyDetected: hasAudioEnergyRef.current,
                            spokenDetected: hasSpokenRef.current
                        });
                        setError('Audio format unsupported. Please try again.');
                    } else if (status === 503 && apiError === 'MODEL_UNAVAILABLE') {
                        incrementVoiceMetric('voice.model_unavailable');
                        trackVoiceOutcome({
                            provider: errorProvider,
                            outcome: 'error',
                            energyDetected: hasAudioEnergyRef.current,
                            spokenDetected: hasSpokenRef.current
                        });
                        setError('Voice engine unavailable. Please try again.');
                    } else if (status === 501 || status === 404) {
                        setCloudAvailable(false);
                        cloudAvailableRef.current = false;
                        trackVoiceOutcome({
                            provider: errorProvider,
                            outcome: 'error',
                            energyDetected: hasAudioEnergyRef.current,
                            spokenDetected: hasSpokenRef.current
                        });
                        setError('Voice engine unavailable. Please try again.');
                    } else {
                        trackVoiceOutcome({
                            provider: errorProvider,
                            outcome: 'error',
                            energyDetected: hasAudioEnergyRef.current,
                            spokenDetected: hasSpokenRef.current
                        });
                        setError('Voice input couldn’t be processed. Please try again.');
                    }
                } finally {
                    setIsProcessing(false);
                    processingRef.current = false;
                    setShowPrivacyNotice(false);
                    setActiveProvider('none');
                    finalizeFallbackSession();
                }
            };

            mediaRecorder.start();
            setListeningState(true);
            fallbackSessionStartRef.current = Date.now();

            if (maxListenTimerRef.current) clearTimeout(maxListenTimerRef.current);
            maxListenTimerRef.current = setTimeout(() => {
                fallbackMaxListenElapsedRef.current = true;
                stopFallback();
            }, MAX_LISTEN_MS);

            try {
                const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                audioContextRef.current = audioContext;
                await audioContext.resume().catch(() => { });
                fallbackAudioContextReadyRef.current = audioContext.state === 'running';
                const source = audioContext.createMediaStreamSource(stream);
                sourceRef.current = source;
                const analyser = audioContext.createAnalyser();
                analyser.fftSize = 2048;
                analyser.smoothingTimeConstant = 0.8;
                analyserRef.current = analyser;
                source.connect(analyser);
                detectSilence();

                // Start no-speech detection only after analyser pipeline is active.
                scheduleFallbackNoSpeechCheck(FALLBACK_NO_SPEECH_GRACE_MS + AUDIO_WARMUP_MS);
            } catch (e) {
                console.warn('Silence detection setup failed:', e);
            }

        } catch (err) {
            console.error(err);
            setError('Microphone access denied.');
            incrementVoiceMetric('voice.denied');
            trackVoiceOutcome({
                provider: provider === 'googlecloud' ? 'googlecloud' : 'wasm',
                outcome: 'denied',
                energyDetected: false,
                spokenDetected: false
            });
            fallbackSessionStartRef.current = null;
            fallbackMaxListenElapsedRef.current = false;
            fallbackWarmupDoneRef.current = false;
            fallbackWarmupSamplesRef.current = [];
            fallbackNoSpeechExtendedRef.current = false;
            fallbackAudioContextReadyRef.current = false;
            baselineNoiseDbRef.current = null;
            energyThresholdDbRef.current = -44;
            speakingThresholdDbRef.current = -35;
            silenceThresholdDbRef.current = -48;
            maxDbSeenRef.current = -120;
            hasAudioEnergyRef.current = false;
            hasSpokenRef.current = false;
            silenceStartRef.current = null;
            setListeningState(false);
        }
    }, [cloudAvailable, scheduleFallbackNoSpeechCheck, stopFallback, trackVoiceOutcome]);

    // Main Toggle Function with Debounce
    const startListening = useCallback(async () => {
        // Prevent rapid clicks
        if (clickDebounceRef.current) return;
        clickDebounceRef.current = setTimeout(() => { clickDebounceRef.current = null; }, 500);

        if (!isSupported || isListening || isProcessing) return;

        if (!isSecureVoiceContext()) {
            setError('Voice input requires HTTPS or localhost.');
            return;
        }

        const permissionState = await getMicrophonePermissionState();
        if (permissionState === 'denied') {
            setError('Microphone access denied.');
            incrementVoiceMetric('voice.denied');
            trackVoiceOutcome({
                provider: recognitionRef.current ? 'webspeech' : 'wasm',
                outcome: 'denied',
                energyDetected: false,
                spokenDetected: false
            });
            return;
        }

        const fallbackSupported = Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
        const targetMode = resolveVoiceInputMode({
            nativeSupported: Boolean(recognitionRef.current),
            nativeUnstable,
            fallbackSupported
        });

        if (targetMode === 'unsupported') {
            setError('Voice input not supported on this browser.');
            return;
        }

        setMode(targetMode);
        if (targetMode === 'native') {
            if (nativeStateRef.current === 'starting' || nativeStateRef.current === 'listening') {
                debugNative('start-ignored', { reason: 'state-guard' });
                return;
            }
            startNative();
        } else {
            const available = await ensureCloudAvailability();
            startFallback(getFallbackProvider(available));
        }
    }, [getMicrophonePermissionState, isListening, isProcessing, isSecureVoiceContext, isSupported, nativeUnstable, startFallback, startNative, trackVoiceOutcome]);

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
