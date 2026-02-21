import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

class AudioProcessor {
    private ffmpeg: FFmpeg | null = null;
    private loaded = false;
    private loadingPromise: Promise<void> | null = null;

    /**
     * Load FFmpeg WASM core. 
     * Uses unpkg CDN for the core files.
     */
    async load() {
        if (this.loaded) return;
        if (this.loadingPromise) return this.loadingPromise;

        this.loadingPromise = (async () => {
            this.ffmpeg = new FFmpeg();

            // Log for debugging
            this.ffmpeg.on('log', ({ message }) => {
                // console.log('[FFmpeg]', message); 
            });

            // Use specific version to ensure compatibility with installed @ffmpeg/ffmpeg
            // Assuming latest 0.12.x
            const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

            await this.ffmpeg.load({
                coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
                wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
            });

            this.loaded = true;
        })();

        await this.loadingPromise;
    }

    /**
     * Process audio blob:
     * 1. Convert to Mono
     * 2. Resample to 16000 Hz
     * 3. Optionally trim silence with guardrails
     * 4. Normalize loudness
     * @param blob Input Audio Blob (usually WebM)
     * @returns Processed WAV Blob
     */
    async process(blob: Blob, hintMimeType?: string): Promise<Blob> {
        if (!this.loaded) await this.load();
        const ffmpeg = this.ffmpeg!;

        const resolvedMime = (hintMimeType || blob.type || '').toLowerCase();
        const inputExt = resolvedMime.includes('ogg')
            ? 'ogg'
            : resolvedMime.includes('mp4')
                ? 'mp4'
                : resolvedMime.includes('wav')
                    ? 'wav'
                    : 'webm';
        const inputName = `input.${inputExt}`;
        const pass1Name = 'output.wav';
        const pass2Name = 'output_trimmed.wav';
        const loudnormFilter = 'loudnorm=I=-16:TP=-1.0:LRA=11';
        const conservativeTrimFilter = [
            'silenceremove=start_periods=1:start_threshold=-55dB',
            'areverse',
            'silenceremove=start_periods=1:start_threshold=-55dB',
            'areverse',
            loudnormFilter
        ].join(',');

        const estimateDurationSeconds = (size: number) => {
            if (size <= 44) return 0;
            return (size - 44) / 32000; // WAV mono 16kHz PCM16 => 32000 bytes/sec
        };

        const minDurationSeconds = 0.6;
        const minTrimEligibleSeconds = 1.2;
        const minSafeBytes = Math.ceil(minDurationSeconds * 32000) + 44;

        let pass1Data: Uint8Array = new Uint8Array();
        let selectedData: Uint8Array = new Uint8Array();
        let usedTrim = false;

        try {
            await ffmpeg.writeFile(inputName, await fetchFile(blob));

            // Pass 1: safe conversion only (no trimming).
            await ffmpeg.exec([
                '-i', inputName,
                '-ac', '1',
                '-ar', '16000',
                '-af', loudnormFilter,
                '-c:a', 'pcm_s16le',
                pass1Name
            ]);

            pass1Data = await ffmpeg.readFile(pass1Name) as Uint8Array;
            selectedData = pass1Data;

            const pass1Duration = estimateDurationSeconds(pass1Data.byteLength);
            if (pass1Duration >= minTrimEligibleSeconds) {
                try {
                    await ffmpeg.exec([
                        '-i', inputName,
                        '-ac', '1',
                        '-ar', '16000',
                        '-af', conservativeTrimFilter,
                        '-c:a', 'pcm_s16le',
                        pass2Name
                    ]);

                    const pass2Data = await ffmpeg.readFile(pass2Name) as Uint8Array;
                    const pass2Duration = estimateDurationSeconds(pass2Data.byteLength);
                    if (pass2Data.byteLength >= minSafeBytes && pass2Duration >= minDurationSeconds) {
                        selectedData = pass2Data;
                        usedTrim = true;
                    }
                } catch {
                    selectedData = pass1Data;
                }
            }
        } finally {
            await ffmpeg.deleteFile(inputName).catch(() => { });
            await ffmpeg.deleteFile(pass1Name).catch(() => { });
            await ffmpeg.deleteFile(pass2Name).catch(() => { });
        }

        if (process.env.NODE_ENV === 'development') {
            console.info('[voice/audio-processor]', {
                inputExt,
                inputBytes: blob.size,
                outputBytes: selectedData.byteLength,
                usedTrim
            });
        }

        return new Blob([selectedData as any], { type: 'audio/wav' });
    }
}

export const audioProcessor = new AudioProcessor();
