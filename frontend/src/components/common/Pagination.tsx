'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
    total: number;
    limit?: number;
}

export default function Pagination({ total, limit = 20 }: PaginationProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const currentPage = Number(searchParams.get('page')) || 1;
    const totalPages = Math.ceil(total / limit);

    const buildPages = () => {
        if (totalPages <= 1) return [];
        const pages = new Set<number>();
        pages.add(1);
        pages.add(totalPages);
        for (let i = currentPage - 2; i <= currentPage + 2; i += 1) {
            if (i > 1 && i < totalPages) pages.add(i);
        }
        const sorted = Array.from(pages).sort((a, b) => a - b);
        const result: Array<number | 'ellipsis'> = [];
        for (let i = 0; i < sorted.length; i += 1) {
            const page = sorted[i];
            const prev = sorted[i - 1];
            if (prev && page - prev > 1) result.push('ellipsis');
            result.push(page);
        }
        return result;
    };

    const handlePageChange = (page: number) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('page', page.toString());
        router.push(`?${params.toString()}`);
    };

    if (totalPages <= 1) return null;

    return (
        <div className="mt-10 flex justify-center">
            <div className="w-full max-w-fit rounded-full border border-[var(--app-border)] surface-card px-3 py-2 flex items-center gap-2 min-h-[44px]">
                <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage <= 1}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text-primary)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <ChevronLeft className="w-4 h-4" />
                    <span className="hidden sm:inline">Prev</span>
                </button>

                <div className="hidden sm:flex items-center gap-1.5 px-1">
                    {buildPages().map((item, idx) =>
                        item === 'ellipsis' ? (
                            <span key={`ellipsis-${idx}`} className="px-2 text-slate-400 dark:text-slate-500">
                                …
                            </span>
                        ) : (
                            <button
                                key={item}
                                onClick={() => handlePageChange(item)}
                                className={`min-w-[36px] h-9 px-3 rounded-full text-sm font-semibold transition-all ${item === currentPage
                                    ? 'btn-primary text-white shadow-md'
                                    : 'text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text-primary)]'
                                    }`}
                            >
                                {item}
                            </button>
                        )
                    )}
                </div>

                <div className="sm:hidden px-3 text-sm font-medium text-slate-600 dark:text-slate-300">
                    Page {currentPage} / {totalPages}
                </div>

                <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text-primary)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <span className="hidden sm:inline">Next</span>
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
