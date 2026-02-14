import { Skeleton } from "@/components/ui/Skeleton";

export function LoadingSpinner({ className = '' }: { className?: string }) {
    return (
        <div className={`animate-spin rounded-full border-2 border-slate-700 border-t-blue-500 h-5 w-5 ${className}`} />
    );
}

export function TableSkeleton({ cols = 4, rows = 5 }: { cols?: number; rows?: number }) {
    return (
        <div className="surface-card rounded-xl border border-[var(--app-border)] overflow-hidden shadow-sm dark:shadow-none">
            <div className="h-12 border-b border-[var(--app-border)] bg-[var(--app-surface-hover)] mb-1" />
            {[...Array(rows)].map((_, i) => (
                <div key={i} className="flex border-t border-[var(--app-border)] items-center">
                    {[...Array(cols)].map((_, j) => (
                        <div key={j} className="flex-1 p-4">
                            <Skeleton className="h-4 w-3/4 rounded" />
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}
