import { ShieldCheck } from 'lucide-react';

interface VerifiedBadgeProps {
    className?: string;
    showText?: boolean;
}

export default function VerifiedBadge({ className = '', showText = true }: VerifiedBadgeProps) {
    return (
        <div className={`inline-flex items-center gap-1 text-blue-400 ${className}`} title="Verified Organization">
            <ShieldCheck className="w-5 h-5" fill="currentColor" fillOpacity={0.2} />
            {showText && <span className="text-xs font-semibold tracking-wide uppercase">Verified</span>}
        </div>
    );
}
