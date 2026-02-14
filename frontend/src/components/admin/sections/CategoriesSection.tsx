'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Tag, Search, ToggleLeft, ToggleRight } from 'lucide-react';
import { fetchAdminCategories, createAdminCategory, updateAdminCategory, deleteAdminCategory, fetchAdminTags, createAdminTag, setAdminCategoryTags } from '@/lib/api';
import CategoryForm from '@/components/admin/CategoryForm';
import { useDebounce } from '@/hooks/useDebounce';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton } from '@/components/ui/Loading';

interface Category {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
    iconKey?: string | null;
    isActive: boolean;
    sortOrder: number;
    parent?: { id: string; name: string } | null;
    parentId?: string | null;
    _count?: { sites: number; organizations: number };
    categoryTags?: { tag: { id: string; name: string; slug: string } }[];
}

export default function CategoriesSection() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [tags, setTags] = useState<{ id: string; name: string; slug: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearch = useDebounce(searchQuery, 300);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    const { showToast } = useToast();

    const loadCategories = async () => {
        try {
            const data = await fetchAdminCategories();
            setCategories(data.sort((a: Category, b: Category) => (a.sortOrder || 0) - (b.sortOrder || 0)));
        } catch (error) {
            console.error('Failed to load categories', error);
            showToast('Failed to load categories', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadCategories();

    }, []);

    const handleCreate = () => {
        if (tags.length === 0) {
            ensureTagsLoaded();
        }
        setEditingCategory(null);
        setIsModalOpen(true);
    };

    const handleEdit = (category: Category) => {
        if (tags.length === 0) {
            ensureTagsLoaded();
        }
        setEditingCategory(category);
        setIsModalOpen(true);
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Are you sure you want to delete or disable ${name}?`)) return;

        try {
            await deleteAdminCategory(id);
            showToast('Category updated successfully', 'success');
            await loadCategories();
        } catch {
            showToast('Failed to delete category', 'error');
        }
    };

    const handleSubmit = async (
        data: { name: string; slug?: string; description?: string; iconKey?: string; parentId?: string | null; sortOrder?: number; isActive?: boolean },
        tagIds: string[]
    ) => {
        setActionLoading(true);
        try {
            if (editingCategory) {
                await updateAdminCategory(editingCategory.id, {
                    ...data,
                    parentId: data.parentId ?? null
                });
                await setAdminCategoryTags(editingCategory.id, tagIds);
                showToast('Category updated successfully', 'success');
            } else {
                const createPayload = { ...data } as typeof data;
                if (!createPayload.parentId) {
                    delete createPayload.parentId;
                }
                const created = await createAdminCategory(createPayload);
                if (tagIds.length > 0) {
                    await setAdminCategoryTags(created.id, tagIds);
                }
                showToast('Category created successfully', 'success');
            }
            await loadCategories();
            setIsModalOpen(false);
        } catch (error: unknown) {
            const msg = (error as any).response?.data?.message || 'Operation failed';
            showToast(msg, 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleToggleActive = async (category: Category) => {
        try {
            await updateAdminCategory(category.id, { isActive: !category.isActive });
            await loadCategories();
        } catch (error) {
            showToast('Failed to update category', 'error');
        }
    };

    const ensureTagsLoaded = async () => {
        try {
            const data = await fetchAdminTags();
            setTags(data);
        } catch (error) {
            showToast('Failed to load tags', 'error');
        }
    };

    const handleCreateTag = async (name: string) => {
        const created = await createAdminTag({ name });
        setTags((prev) => {
            const existing = prev.find(tag => tag.id === created.id);
            if (existing) return prev;
            return [...prev, created].sort((a, b) => a.name.localeCompare(b.name));
        });
        return created;
    };

    const filteredCategories = categories.filter(c =>
        c.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        c.slug.toLowerCase().includes(debouncedSearch.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center sm:flex-row flex-col gap-4">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Tag className="w-8 h-8 text-blue-600 dark:text-blue-500" />
                    Categories
                </h1>
                <button
                    onClick={handleCreate}
                    className="btn-primary px-4 py-2 rounded-lg flex items-center gap-2 transition-colors w-full sm:w-auto justify-center"
                >
                    <Plus className="w-5 h-5" />
                    Add Category
                </button>
            </div>

            {/* Search Bar */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                    type="text"
                    placeholder="Search categories..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-transparent border border-[var(--app-border)] rounded-lg pl-10 pr-4 py-3 text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500 transition-colors"
                />
            </div>

            {loading ? (
                <TableSkeleton cols={7} rows={5} />
            ) : (
                <div className="surface-card rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-left">
                        <thead className="bg-app-secondary/50 text-[var(--app-text-secondary)] text-sm uppercase">
                            <tr>
                                <th className="px-6 py-4 font-medium">Name</th>
                                <th className="px-6 py-4 font-medium">Slug</th>
                                <th className="px-6 py-4 font-medium">Parent</th>
                                <th className="px-6 py-4 font-medium">Active</th>
                                <th className="px-6 py-4 font-medium">Sort</th>
                                <th className="px-6 py-4 font-medium">Linked</th>
                                <th className="px-6 py-4 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                            {filteredCategories.map((category) => (
                                <tr key={category.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                                    <td className="px-6 py-4 text-slate-900 dark:text-white font-medium">{category.name}</td>
                                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-mono text-sm">{category.slug}</td>
                                    <td className="px-6 py-4 text-slate-500 dark:text-slate-300 text-sm">
                                        {category.parent?.name || '-'}
                                    </td>
                                    <td className="px-6 py-4 text-slate-500 dark:text-slate-300">
                                        <button
                                            onClick={() => handleToggleActive(category)}
                                            className={`inline-flex items-center gap-2 text-sm ${category.isActive ? 'text-emerald-500 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'}`}
                                            title="Toggle active"
                                        >
                                            {category.isActive ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                                            {category.isActive ? 'Active' : 'Disabled'}
                                        </button>
                                    </td>
                                    <td className="px-6 py-4 text-slate-500 dark:text-slate-300">
                                        <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-xs font-medium border border-slate-200 dark:border-slate-600">
                                            {category.sortOrder ?? 0}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-slate-500 dark:text-slate-300 text-sm">
                                        {category._count ? `${category._count.organizations} orgs • ${category._count.sites} sites` : '-'}
                                    </td>
                                    <td className="px-6 py-4 text-right flex justify-end gap-3">
                                        <button
                                            onClick={() => handleEdit(category)}
                                            className="text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 p-2 hover:bg-blue-50 dark:hover:bg-blue-400/10 rounded-lg transition-colors"
                                            title="Edit"
                                        >
                                            <Edit className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(category.id, category.name)}
                                            className="text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300 p-2 hover:bg-red-50 dark:hover:bg-red-400/10 rounded-lg transition-colors"
                                            title="Delete"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {filteredCategories.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500 dark:text-slate-500">
                                        No categories found
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {isModalOpen && (
                <CategoryForm
                    initialData={editingCategory}
                    categories={categories.map(category => ({ id: category.id, name: category.name }))}
                    availableTags={tags}
                    onCreateTag={handleCreateTag}
                    onSubmit={handleSubmit}
                    onCancel={() => setIsModalOpen(false)}
                    isLoading={actionLoading}
                />
            )}
        </div>
    );
}
