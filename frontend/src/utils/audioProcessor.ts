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
     * 3. Trim silence (Start/End)
     * 4. Normalize loudness
     * @param blob Input Audio Blob (usually WebM)
     * @returns Processed WAV Blob
     */
    async process(blob: Blob): Promise<Blob> {
        if (!this.loaded) await this.load();
        const ffmpeg = this.ffmpeg!;

        const inputName = 'input.webm';
        const outputName = 'output.wav';

        await ffmpeg.writeFile(inputName, await fetchFile(blob));

        // Filter Chain:
        // 1. silenceremove (Start): remove silence at start
        // 2. areverse: reverse audio to process end
        // 3. silenceremove (Start of reversed = End of original): remove silence at new start
        // 4. areverse: reverse back
        // 5. loudnorm: Loudness normalization

        // Thresholds: -40dB for silence.
        const filters = [
            'silenceremove=start_periods=1:start_threshold=-40dB',
            'areverse',
            'silenceremove=start_periods=1:start_threshold=-40dB',
            'areverse',
            'loudnorm=I=-16:TP=-1.0:LRA=11'
        ].join(',');

        await ffmpeg.exec([
            '-i', inputName,
            '-ac', '1',          // Mono
            '-ar', '16000',      // 16kHz
            '-af', filters,      // Filters
            outputName
        ]);

        const data = await ffmpeg.readFile(outputName);

        // Cleanup to free memory
        await ffmpeg.deleteFile(inputName);
        await ffmpeg.deleteFile(outputName);

        return new Blob([data as any], { type: 'audio/wav' });
    }
}

export const audioProcessor = new AudioProcessor();
