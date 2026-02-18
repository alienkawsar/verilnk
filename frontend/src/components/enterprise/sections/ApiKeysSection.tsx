'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    Copy,
    Eye,
    EyeOff,
    Key,
    Loader2,
    Plus,
    RefreshCw,
    Search,
    Trash2
} from 'lucide-react';
import { TableSkeleton } from '@/components/ui/Loading';
import {
    createApiKey,
    getApiKeys,
    getApiScopes,
    isLimitReachedError,
    logApiKeyCopy,
    revokeApiKey,
    rotateApiKey,
    type ApiKey,
    type ApiScope
} from '@/lib/enterprise-api';
import type { WorkspaceSectionProps } from '../section-types';
import { normalizeWorkspaceRole } from '../section-types';
import {
    emptyStateIconClass,
    searchInputClass,
    sectionCardClass,
    sectionTitleClass
} from './shared';

export default function ApiKeysSection({
    workspaceId,
    enterpriseAccess,
    userRole,
    showToast
}: WorkspaceSectionProps) {
    const [loading, setLoading] = useState(true);
    const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
    const [scopes, setScopes] = useState<Record<string, ApiScope>>({});
    const [search, setSearch] = useState('');
    const [error, setError] = useState<string | null>(null);

    const [showCreateApiKeyModal, setShowCreateApiKeyModal] = useState(false);
    const [newApiKeyName, setNewApiKeyName] = useState('');
    const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
    const [createdKey, setCreatedKey] = useState<string | null>(null);
    const [showKey, setShowKey] = useState(false);
    const [creating, setCreating] = useState(false);
    const [apiKeySecrets, setApiKeySecrets] = useState<Record<string, string>>({});

    const normalizedRole = normalizeWorkspaceRole(userRole);
    const canManageApiKeys = normalizedRole === 'OWNER' || normalizedRole === 'ADMIN';
    const canCopyApiKeys = normalizedRole === 'OWNER' || normalizedRole === 'ADMIN' || normalizedRole === 'DEVELOPER';

    const quotaLimits = enterpriseAccess?.entitlements;
    const quotaUsage = enterpriseAccess?.usage;
    const apiKeyLimitReached = Boolean(
        quotaLimits
        && quotaUsage
        && quotaLimits.maxApiKeys > 0
        && quotaUsage.apiKeys >= quotaLimits.maxApiKeys
    );

    const searchNormalized = search.trim().toLowerCase();
    const filteredApiKeys = useMemo(() => {
        if (!searchNormalized) return apiKeys;
        return apiKeys.filter((key) => {
            const haystack = `${key.name} ${key.prefix} ${key.scopes.join(' ')}`.toLowerCase();
            return haystack.includes(searchNormalized);
        });
    }, [apiKeys, searchNormalized]);

    useEffect(() => {
        let mounted = true;
        const controller = new AbortController();
        const load = async () => {
            try {
                setLoading(true);
                setError(null);
                const [{ apiKeys: keys }, { scopes: sc }] = await Promise.all([
                    getApiKeys(workspaceId, { signal: controller.signal }),
                    getApiScopes({ signal: controller.signal })
                ]);
                if (!mounted) return;
                setApiKeys(keys || []);
                setScopes(sc || {});
            } catch (err: any) {
                if (!mounted || controller.signal.aborted) return;
                const message = err?.message || 'Failed to load API keys';
                setError(message);
                showToast(message, 'error');
            } finally {
                if (mounted) setLoading(false);
            }
        };

        void load();
        return () => {
            mounted = false;
            controller.abort();
        };
    }, [workspaceId, showToast]);

    const refreshData = async () => {
        const [{ apiKeys: keys }, { scopes: sc }] = await Promise.all([
            getApiKeys(workspaceId),
            getApiScopes()
        ]);
        setApiKeys(keys || []);
        setScopes(sc || {});
    };

    const copyToClipboard = async (text: string) => {
        await navigator.clipboard.writeText(text);
    };

    const handleCreateApiKey = async () => {
        if (!canManageApiKeys) {
            showToast("You don't have permission to do that.", 'error');
            return;
        }
        if (!newApiKeyName.trim() || selectedScopes.length === 0) return;
        if (apiKeyLimitReached) {
            showToast(
                `Limit reached: API Keys (${quotaUsage?.apiKeys ?? 0}/${quotaLimits?.maxApiKeys ?? 0})`,
                'error'
            );
            return;
        }
        try {
            setCreating(true);
            const result = await createApiKey(workspaceId, newApiKeyName.trim(), selectedScopes);
            setCreatedKey(result.plainTextKey);
            setApiKeySecrets((prev) => ({ ...prev, [result.apiKey.id]: result.plainTextKey }));
            setNewApiKeyName('');
            setSelectedScopes([]);
            await refreshData();
        } catch (err: any) {
            if (isLimitReachedError(err)) {
                showToast(err.message, 'error');
                return;
            }
            setError(err?.message || 'Failed to create API key');
        } finally {
            setCreating(false);
        }
    };

    const handleRevokeKey = async (keyId: string) => {
        if (!canManageApiKeys) {
            showToast("You don't have permission to do that.", 'error');
            return;
        }
        if (!window.confirm('Are you sure you want to revoke this API key? This action cannot be undone.')) return;

        try {
            await revokeApiKey(workspaceId, keyId);
            setApiKeySecrets((prev) => {
                const next = { ...prev };
                delete next[keyId];
                return next;
            });
            showToast('API key revoked', 'success');
            await refreshData();
        } catch (err: any) {
            setError(err?.message || 'Failed to revoke API key');
        }
    };

    const handleRotateKey = async (keyId: string) => {
        if (!canManageApiKeys) {
            showToast("You don't have permission to do that.", 'error');
            return;
        }
        if (!window.confirm('Rotate this key? The old key will stop working immediately.')) return;

        try {
            const result = await rotateApiKey(workspaceId, keyId);
            setCreatedKey(result.plainTextKey);
            setApiKeySecrets((prev) => ({ ...prev, [result.apiKey.id]: result.plainTextKey }));
            showToast('API key rotated', 'success');
            await refreshData();
        } catch (err: any) {
            setError(err?.message || 'Failed to rotate API key');
        }
    };

    const handleCopyActiveApiKey = async (keyId: string) => {
        if (!canCopyApiKeys) {
            showToast("You don't have permission to do that.", 'error');
            return;
        }
        const secret = apiKeySecrets[keyId];
        if (!secret) {
            showToast('Key is only shown once on creation. Rotate to generate a new key.', 'error');
            return;
        }
        try {
            await logApiKeyCopy(workspaceId, keyId);
            await copyToClipboard(secret);
            showToast('API key copied', 'success');
        } catch (err: any) {
            showToast(err?.message || 'Failed to copy API key', 'error');
        }
    };

    return (
        <>
            <div className="space-y-6">
                <div className={sectionCardClass}>
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className={sectionTitleClass}>API Keys</h2>
                            <p className="text-sm text-[var(--app-text-secondary)] mt-1">
                                Create and manage workspace API credentials.
                            </p>
                        </div>
                        {canManageApiKeys && (
                            <button
                                onClick={() => setShowCreateApiKeyModal(true)}
                                disabled={apiKeyLimitReached}
                                className="inline-flex items-center gap-2 px-4 py-2 btn-primary text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Plus className="w-4 h-4" />
                                Create API Key
                            </button>
                        )}
                    </div>
                    <div className="mt-4 relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search API keys..."
                            className={`pl-9 ${searchInputClass}`}
                        />
                    </div>
                    {apiKeyLimitReached && (
                        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                            Limit reached: API Keys ({quotaUsage?.apiKeys ?? 0}/{quotaLimits?.maxApiKeys ?? 0})
                        </p>
                    )}
                </div>

                {error && (
                    <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                        {error}
                    </div>
                )}

                <div className={sectionCardClass}>
                    {loading ? (
                        <TableSkeleton cols={4} rows={4} />
                    ) : apiKeys.length === 0 ? (
                        <div className="py-12 text-center">
                            <Key className={emptyStateIconClass} />
                            <p className="text-lg font-semibold text-slate-900 dark:text-white">No API keys yet</p>
                            <p className="text-sm text-[var(--app-text-secondary)] mt-1">Create a key to start making authenticated API requests.</p>
                        </div>
                    ) : filteredApiKeys.length === 0 ? (
                        <div className="py-8 text-center text-sm text-[var(--app-text-secondary)]">
                            No API keys match your search.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredApiKeys.map((key) => (
                                <div key={key.id} className={`p-4 surface-card rounded-lg ${key.isRevoked ? 'opacity-60' : ''}`}>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-medium text-slate-900 dark:text-white">{key.name}</h3>
                                            {key.isRevoked && (
                                                <span className="px-2 py-0.5 text-xs bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 rounded">
                                                    Revoked
                                                </span>
                                            )}
                                        </div>
                                        {!key.isRevoked && (canCopyApiKeys || canManageApiKeys) && (
                                            <div className="flex items-center gap-1">
                                                {canCopyApiKeys && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCopyActiveApiKey(key.id)}
                                                        disabled={!apiKeySecrets[key.id]}
                                                        className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        title={apiKeySecrets[key.id] ? 'Copy key' : 'Key is only shown once on creation. Rotate to generate a new key.'}
                                                    >
                                                        <Copy className="w-4 h-4" />
                                                    </button>
                                                )}
                                                {canManageApiKeys && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRotateKey(key.id)}
                                                            className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                                            title="Rotate"
                                                        >
                                                            <RefreshCw className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRevokeKey(key.id)}
                                                            className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                                                            title="Revoke"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
                                        <code className="font-mono">{key.prefix}...</code>
                                        <span>{key.lastUsedAt ? `Last used ${new Date(key.lastUsedAt).toLocaleDateString()}` : 'Never used'}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {key.scopes.map((scope) => (
                                            <span
                                                key={scope}
                                                className="px-2 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded"
                                            >
                                                {scope}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {showCreateApiKeyModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg p-6">
                        {createdKey ? (
                            <>
                                <div className="text-center mb-6">
                                    <Key className="w-12 h-12 text-blue-500 mx-auto mb-4" />
                                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">API Key Created</h2>
                                    <p className="text-slate-600 dark:text-slate-400 text-sm">
                                        Copy this key now. It will not be shown again!
                                    </p>
                                </div>
                                <div className="mb-6">
                                    <div className="relative">
                                        <input
                                            type={showKey ? 'text' : 'password'}
                                            value={createdKey}
                                            readOnly
                                            className="w-full px-4 py-3 pr-24 font-mono text-sm bg-slate-100 dark:bg-slate-800 rounded-lg"
                                        />
                                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                                            <button
                                                onClick={() => setShowKey(!showKey)}
                                                className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
                                            >
                                                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                            <button
                                                onClick={() => copyToClipboard(createdKey)}
                                                className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
                                            >
                                                <Copy className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        setShowCreateApiKeyModal(false);
                                        setCreatedKey(null);
                                        setShowKey(false);
                                    }}
                                    className="w-full px-4 py-2.5 btn-primary font-medium rounded-lg"
                                >
                                    Done
                                </button>
                            </>
                        ) : (
                            <>
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Create API Key</h2>
                                <div className="space-y-4 mb-6">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Key Name</label>
                                        <input
                                            type="text"
                                            value={newApiKeyName}
                                            onChange={(e) => setNewApiKeyName(e.target.value)}
                                            placeholder="e.g., Production API"
                                            className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                            Scopes (Permissions)
                                        </label>
                                        <div className="space-y-2 max-h-56 overflow-y-auto">
                                            {Object.entries(scopes).map(([scopeKey, scope]) => (
                                                <label
                                                    key={scopeKey}
                                                    className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedScopes.includes(scopeKey)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setSelectedScopes((prev) => [...prev, scopeKey]);
                                                            } else {
                                                                setSelectedScopes((prev) => prev.filter((s) => s !== scopeKey));
                                                            }
                                                        }}
                                                        className="mt-1"
                                                    />
                                                    <div>
                                                        <p className="font-medium text-slate-900 dark:text-white text-sm">{scope.name}</p>
                                                        <p className="text-xs text-slate-500 dark:text-slate-400">{scope.description}</p>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => {
                                            setShowCreateApiKeyModal(false);
                                            setNewApiKeyName('');
                                            setSelectedScopes([]);
                                        }}
                                        className="flex-1 px-4 py-2.5 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleCreateApiKey}
                                        disabled={apiKeyLimitReached || creating || !newApiKeyName.trim() || selectedScopes.length === 0}
                                        className="flex-1 px-4 py-2.5 btn-primary font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {creating ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Creating...
                                            </>
                                        ) : (
                                            'Create Key'
                                        )}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}

