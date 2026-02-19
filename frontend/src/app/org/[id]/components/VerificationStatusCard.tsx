import { ShieldCheck } from 'lucide-react';
import VerifiedBadge from '@/components/ui/VerifiedBadge';
import { getDisplayDomain } from './types';
import { sectionClass, sectionHeadingClass } from './styles';

interface VerificationStatusCardProps {
  website?: string;
}

export default function VerificationStatusCard({
  website,
}: VerificationStatusCardProps) {
  return (
    <section className={sectionClass}>
      <h2 className={sectionHeadingClass}>Verification Status</h2>

      <div className='mt-4 rounded-xl border border-green-200/60 bg-green-50/80 p-4 text-green-700 dark:border-green-900/30 dark:bg-green-900/20 dark:text-green-400'>
        <div className='flex items-start gap-3'>
          <VerifiedBadge
            className='mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400'
            showText={false}
          />
          <div>
            <p className='text-sm font-semibold'>Identity Verified</p>
            <p className='text-xs opacity-90'>Officially verified entity</p>
          </div>
        </div>
      </div>

      <p className='mt-4 text-xs leading-relaxed text-slate-600 dark:text-slate-400'>
        Verified by VeriLnk. Official domain:{' '}
        <span className='font-semibold text-slate-900 dark:text-white'>
          {getDisplayDomain(website)}
        </span>
        .
      </p>
      <div className='mt-2 inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400'>
        <ShieldCheck className='h-3.5 w-3.5' />
        Domain ownership reviewed
      </div>
    </section>
  );
}
