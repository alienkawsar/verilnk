import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { X, Upload, Loader2, Image as ImageIcon } from 'lucide-react';
import { uploadFile } from '@/lib/api';
import { getImageUrl } from '@/lib/utils';

interface CountryFormProps {
    initialData?: { id: string; name: string; code: string; flagImage?: string; flagImageUrl?: string } | null;
    onSubmit: (data: { name: string; code: string; flagImage?: string; flagImageUrl?: string }) => Promise<void>;
    onCancel: () => void;
    isLoading: boolean;
}

export default function CountryForm({ initialData, onSubmit, onCancel, isLoading }: CountryFormProps) {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [flagImage, setFlagImage] = useState('');
    const [flagImageUrl, setFlagImageUrl] = useState('');
    const [useUrl, setUseUrl] = useState(false);
    const [error, setError] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [urlPreviewError, setUrlPreviewError] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {

        if (initialData) {
            setName(initialData.name);
            setCode(initialData.code);
            setFlagImage(initialData.flagImage || '');
            setFlagImageUrl(initialData.flagImageUrl || '');
            setUseUrl(!!initialData.flagImageUrl);
            setUrlPreviewError(false);
        } else {
            setName('');
            setCode('');
            setFlagImage('');
            setFlagImageUrl('');
            setUseUrl(false);
            setUrlPreviewError(false);
        }
    }, [initialData]);

    useEffect(() => {
        setUrlPreviewError(false);
    }, [flagImageUrl]);

    const toPreviewUrl = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return '';
        if (/^https?:\/\//i.test(trimmed)) return trimmed;
        if (trimmed.startsWith('//')) return `https:${trimmed}`;
        return `https://${trimmed}`;
    };
    const previewUrl = useUrl ? toPreviewUrl(flagImageUrl) : '';
    const localPreviewUrl = !useUrl && flagImage ? getImageUrl(flagImage) : '';
    const placeholderText = (code || name || 'NA').trim().slice(0, 3).toUpperCase();

    const normalizeUploadedPath = (url: string) => {
        const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api').replace('/api', '');
        if (url.startsWith(apiBase)) {
            const trimmed = url.slice(apiBase.length);
            return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
        }
        return url;
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Reset error
        setError('');

        // Validate file type
        if (!file.type.startsWith('image/')) {
            setError('Please upload an image file');
            return;
        }

        // Validate file size (e.g., 5MB)
        if (file.size > 5 * 1024 * 1024) {
            setError('File size must be less than 5MB');
            return;
        }

        setIsUploading(true);
        try {
            const result = await uploadFile(file);
            setUseUrl(false);
            setFlagImageUrl('');
            setFlagImage(normalizeUploadedPath(result.url));
        } catch (err: any) {
            console.error('Upload failed', err);
            setError('Failed to upload image. Please try again.');
        } finally {
            setIsUploading(false);
            // Reset input so same file can be selected again if needed (though unlikely)
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const [validationErrors, setValidationErrors] = useState<any[]>([]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setValidationErrors([]);

        if (code.length < 2 || code.length > 3) {
            setError('Code must be 2 or 3 characters');
            return;
        }

        try {
            const normalizedUrl = useUrl ? toPreviewUrl(flagImageUrl) : undefined;
            const payload: { name: string; code: string; flagImage?: string; flagImageUrl?: string } = { name, code };
            if (useUrl) {
                if (normalizedUrl) payload.flagImageUrl = normalizedUrl;
            } else if (flagImage) {
                payload.flagImage = flagImage;
            }
            await onSubmit(payload);
        } catch (err: any) {
            console.error('Submit error:', err);
            const msg = err.response?.data?.message || err.message || 'Something went wrong';
            setError(msg);

            // Force capture of the entire response for debugging if standard error list is missing
            if (err.response?.data?.errors) {
                setValidationErrors(err.response.data.errors);
            } else if (err.response?.data) {
                setValidationErrors([{ path: ['DEBUG'], message: JSON.stringify(err.response.data) }]);
            } else {
                setValidationErrors([{ path: ['DEBUG'], message: 'No response data. Check console.' }]);
            }
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="surface-card rounded-xl p-6 w-full max-w-md border border-[var(--app-border)] max-h-[90vh] overflow-y-auto shadow-xl">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-[var(--app-text-primary)]">
                        {initialData ? 'Edit Country' : 'Add Country'}
                    </h3>
                    <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {error && (
                    <div className="bg-red-500/10 text-red-400 p-3 rounded-lg mb-4 text-sm overflow-auto max-h-40">
                        <p className="font-bold">{error}</p>

                        {/* DEBUG: Show raw error response to help identify the issue */}
                        <details className="mt-2 text-xs font-mono text-red-300">
                            <summary className="cursor-pointer hover:text-white">Raw Server Response</summary>
                            <pre className="mt-1 whitespace-pre-wrap">
                                {JSON.stringify(validationErrors.length > 0 ? validationErrors : 'No detailed errors', null, 2)}
                            </pre>
                        </details>

                        {validationErrors.length > 0 && (
                            <ul className="list-disc list-inside mt-2 space-y-1">
                                {validationErrors.map((issue, idx) => (
                                    <li key={idx}>
                                        <span className="font-semibold capitalize">{issue.path.join('.')}</span>: {issue.message}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-[var(--app-text-secondary)] mb-1">Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-4 py-2 bg-transparent border border-[var(--app-border)] rounded-lg text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500 transition-colors"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[var(--app-text-secondary)] mb-1">ISO Code</label>
                        <input
                            type="text"
                            value={code}
                            onChange={(e) => setCode(e.target.value.toUpperCase())}
                            className="w-full px-4 py-2 bg-transparent border border-[var(--app-border)] rounded-lg text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500 transition-colors"
                            required
                            maxLength={3}
                            placeholder="e.g. US"
                        />
                    </div>

                    {/* Image Upload Section */}
                    <div>
                        <label className="block text-sm font-medium text-[var(--app-text-secondary)] mb-2">Flag Image</label>

                        {/* Toggle between Upload and URL */}
                        <div className="flex gap-4 mb-4 text-sm">
                            <button
                                type="button"
                                onClick={() => { setUseUrl(false); setFlagImageUrl(''); setUrlPreviewError(false); }}
                                className={`px-3 py-1 rounded-full transition-colors ${!useUrl ? 'btn-primary' : 'bg-[var(--app-surface-hover)] text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)]'}`}
                            >
                                Upload File
                            </button>
                            <button
                                type="button"
                                onClick={() => { setUseUrl(true); setFlagImage(''); setUrlPreviewError(false); }}
                                className={`px-3 py-1 rounded-full transition-colors ${useUrl ? 'btn-primary' : 'bg-[var(--app-surface-hover)] text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)]'}`}
                            >
                                External URL
                            </button>
                        </div>

                        {!useUrl ? (
                            <div className="flex items-start gap-4">
                                {/* Preview Area */}
                                <div className="w-20 h-14 bg-transparent border border-[var(--app-border)] rounded-lg flex items-center justify-center overflow-hidden relative group">
                                    {isUploading ? (
                                        <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                                    ) : localPreviewUrl ? (
                                        <>
                                            { }
                                            <img src={localPreviewUrl} alt="Flag" className="w-full h-full object-cover" />
                                            <button
                                                type="button"
                                                onClick={() => setFlagImage('')}
                                                className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <X className="w-5 h-5 text-white" />
                                            </button>
                                        </>
                                    ) : (
                                        <ImageIcon className="w-6 h-6 text-slate-600" />
                                    )}
                                </div>

                                {/* Upload Button */}
                                <div className="flex-1">
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleFileSelect}
                                        accept="image/*"
                                        className="hidden"
                                        id="flag-upload"
                                    />
                                    <label
                                        htmlFor="flag-upload"
                                        className={`flex items-center justify-center gap-2 w-full px-4 py-2 border border-dashed border-[var(--app-border)] rounded-lg text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)] hover:border-blue-500 hover:bg-[var(--app-surface-hover)] transition-colors cursor-pointer ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
                                    >
                                        <Upload className="w-4 h-4" />
                                        <span>{flagImage ? 'Change Image' : 'Upload Image'}</span>
                                    </label>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                        Recommended: PNG or SVG, max 5MB.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <input
                                    type="url"
                                    value={flagImageUrl}
                                    onChange={(e) => setFlagImageUrl(e.target.value)}
                                    placeholder="https://example.com/flag.png"
                                    className="w-full px-4 py-2 bg-transparent border border-[var(--app-border)] rounded-lg text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500 transition-colors"
                                />
                                <div className="flex items-center gap-4">
                                    <div className="text-sm text-slate-600 dark:text-slate-400">Preview:</div>
                                    <div className="relative w-10 h-7 bg-transparent rounded overflow-hidden border border-[var(--app-border)] flex items-center justify-center">
                                        {previewUrl && !urlPreviewError ? (
                                            <Image
                                                src={previewUrl}
                                                alt="Preview"
                                                fill
                                                className="object-cover"
                                                sizes="40px"
                                                onError={() => setUrlPreviewError(true)}
                                            />
                                        ) : (
                                            <span className="text-[10px] font-semibold text-slate-400">
                                                {placeholderText}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end gap-3 mt-6">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="px-4 py-2 text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)] transition-colors"
                            disabled={isLoading || isUploading}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading || isUploading}
                            className="px-4 py-2 btn-primary rounded-lg disabled:opacity-50 flex items-center gap-2"
                        >
                            {(isLoading || isUploading) && <Loader2 className="w-4 h-4 animate-spin" />}
                            {isLoading ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
