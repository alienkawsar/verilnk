import { cn } from "@/lib/utils"

function Skeleton({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                "animate-pulse rounded-md bg-black/[0.06] dark:bg-white/[0.06]",
                className
            )}
            {...props}
        />
    )
}

export { Skeleton }
