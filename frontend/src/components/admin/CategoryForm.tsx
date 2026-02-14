'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Plus } from 'lucide-react';

interface CategoryFormProps {
    initialData?: {
        id: string;
        name: string;
        slug: string;
        description?: string | null;
        iconKey?: string | null;
        isActive: boolean;
        sortOrder: number;
        parentId?: string | null;
        categoryTags?: { tag: { id: string; name: string; slug: string } }[];
    } | null;
    categories: { id: string; name: string }[];
    availableTags: { id: string; name: string; slug: string }[];
    onCreateTag: (name: string) => Promise<{ id: string; name: string; slug: string }>;
    onSubmit: (data: { name: string; slug?: string; description?: string; iconKey?: string; parentId?: string | null; sortOrder?: number; isActive?: boolean }, tagIds: string[]) => Promise<void>;
    onCancel: () => void;
    isLoading: boolean;
}

export default function CategoryForm({ initialData, categories, availableTags, onCreateTag, onSubmit, onCancel, isLoading }: CategoryFormProps) {
    const [name, setName] = useState('');
    const [slug, setSlug] = useState('');
    const [description, setDescription] = useState('');
    const [iconKey, setIconKey] = useState('');
    const [sortOrder, setSortOrder] = useState(0);
    const [isActive, setIsActive] = useState(true);
    const [parentId, setParentId] = useState<string | null>(null);
    const [tagQuery, setTagQuery] = useState('');
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
    const [error, setError] = useState('');

    useEffect(() => {

        if (initialData) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setName(initialData.name);
            setSlug(initialData.slug || '');
            setDescription(initialData.description || '');
            setIconKey(initialData.iconKey || '');
            setSortOrder(initialData.sortOrder || 0);
            setIsActive(initialData.isActive !== false);
            setParentId(initialData.parentId || null);
            setSelectedTagIds(initialData.categoryTags?.map((entry) => entry.tag.id) || []);
        } else {
            setName('');
            setSlug('');
            setDescription('');
            setIconKey('');
            setSortOrder(0);
            setIsActive(true);
            setParentId(null);
            setSelectedTagIds([]);
        }
    }, [initialData]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        try {
            await onSubmit({
                name,
                slug: slug.trim() || undefined,
                description: description.trim() || undefined,
                iconKey: iconKey.trim() || undefined,
                parentId: parentId || null,
                sortOrder: Number(sortOrder) || 0,
                isActive
            }, selectedTagIds);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Something went wrong');
        }
    };

    const filteredTags = useMemo(() => {
        const q = tagQuery.trim().toLowerCase();
        if (!q) return availableTags;
        return availableTags.filter(tag =>
            tag.name.toLowerCase().includes(q) || tag.slug.toLowerCase().includes(q)
        );
    }, [availableTags, tagQuery]);

    const handleAddTag = async (tagId: string) => {
        if (selectedTagIds.includes(tagId)) return;
        setSelectedTagIds((prev) => [...prev, tagId]);
    };

    const handleRemoveTag = (tagId: string) => {
        setSelectedTagIds((prev) => prev.filter(id => id !== tagId));
    };

    const handleCreateTag = async () => {
        const nameValue = tagQuery.trim();
        if (!nameValue) return;
        try {
            const created = await onCreateTag(nameValue);
            setSelectedTagIds((prev) => [...prev, created.id]);
            setTagQuery('');
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Failed to create tag');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="surface-card rounded-xl p-6 w-full max-w-xl border border-[var(--app-border)] shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-[var(--app-text-primary)]">
                        {initialData ? 'Edit Category' : 'Add Category'}
                    </h3>
                    <button onClick={onCancel} className="text-slate-400 hover:text-slate-500 dark:hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {error && (
                    <div className="bg-red-500/10 text-red-400 p-3 rounded-lg mb-4 text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-[var(--app-text-secondary)] mb-1">Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-4 py-2 bg-transparent border border-[var(--app-border)] rounded-lg text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[var(--app-text-secondary)] mb-1">Slug</label>
                        <input
                            type="text"
                            value={slug}
                            onChange={(e) => setSlug(e.target.value)}
                            className="w-full px-4 py-2 bg-transparent border border-[var(--app-border)] rounded-lg text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500"
                            placeholder="auto-generated from name"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[var(--app-text-secondary)] mb-1">Description</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full px-4 py-2 bg-transparent border border-[var(--app-border)] rounded-lg text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500 min-h-[90px]"
                        />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-[var(--app-text-secondary)] mb-1">Icon Key</label>
                            <input
                                type="text"
                                value={iconKey}
                                onChange={(e) => setIconKey(e.target.value)}
                                className="w-full px-4 py-2 bg-transparent border border-[var(--app-border)] rounded-lg text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[var(--app-text-secondary)] mb-1">Sort Order</label>
                            <input
                                type="number"
                                value={sortOrder}
                                onChange={(e) => setSortOrder(Number(e.target.value))}
                                className="w-full px-4 py-2 bg-transparent border border-[var(--app-border)] rounded-lg text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500"
                                required
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-[var(--app-text-secondary)] mb-1">Parent Category</label>
                            <select
                                value={parentId || ''}
                                onChange={(e) => setParentId(e.target.value || null)}
                                className="w-full px-4 py-2 bg-transparent border border-[var(--app-border)] rounded-lg text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500"
                            >
                                <option value="">None</option>
                                {categories.filter(c => c.id !== initialData?.id).map((category) => (
                                    <option key={category.id} value={category.id}>{category.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-center gap-3">
                            <input
                                id="category-active"
                                type="checkbox"
                                checked={isActive}
                                onChange={(e) => setIsActive(e.target.checked)}
                                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                            />
                            <label htmlFor="category-active" className="text-sm text-[var(--app-text-primary)]">Active</label>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[var(--app-text-secondary)] mb-2">Tags</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={tagQuery}
                                onChange={(e) => setTagQuery(e.target.value)}
                                className="flex-1 px-4 py-2 bg-transparent border border-[var(--app-border)] rounded-lg text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500"
                                placeholder="Search or create tag"
                            />
                            <button
                                type="button"
                                onClick={handleCreateTag}
                                className="px-3 py-2 bg-[var(--app-surface-hover)] border border-[var(--app-border)] text-[var(--app-text-primary)] hover:border-blue-500 rounded-lg text-sm flex items-center gap-1"
                            >
                                <Plus className="w-4 h-4" />
                                Add
                            </button>
                        </div>
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-auto rounded-lg border border-[var(--app-border)] p-2 bg-transparent">
                            {filteredTags.length === 0 && (
                                <p className="text-slate-500 text-sm px-2 py-1">No tags found</p>
                            )}
                            {filteredTags.map(tag => {
                                const selected = selectedTagIds.includes(tag.id);
                                return (
                                    <button
                                        type="button"
                                        key={tag.id}
                                        onClick={() => handleAddTag(tag.id)}
                                        className={`text-left px-3 py-2 rounded-md text-sm border ${selected ? 'bg-[var(--app-primary)]/10 border-[var(--app-primary)] text-[var(--app-primary)]' : 'border-transparent text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text-primary)]'}`}
                                        disabled={selected}
                                    >
                                        {tag.name}
                                        <span className="text-xs text-slate-500 block">{tag.slug}</span>
                                    </button>
                                );
                            })}
                        </div>
                        {selectedTagIds.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {selectedTagIds.map(tagId => {
                                    const tag = availableTags.find(t => t.id === tagId);
                                    if (!tag) return null;
                                    return (
                                        <span key={tagId} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--app-surface-hover)] text-[var(--app-text-primary)] text-sm border border-[var(--app-border)]">
                                            {tag.name}
                                            <button type="button" onClick={() => handleRemoveTag(tagId)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end gap-3 mt-6">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="px-4 py-2 text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)] transition-colors"
                            disabled={isLoading}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="px-4 py-2 btn-primary rounded-lg disabled:opacity-50"
                        >
                            {isLoading ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
