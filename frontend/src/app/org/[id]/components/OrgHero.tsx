import Image from 'next/image';
import type { ComponentType } from 'react';
import {
  Building2,
  ExternalLink,
  Eye,
  MapPin,
  ShieldCheck,
  Tag,
} from 'lucide-react';
import VerifiedBadge from '@/components/ui/VerifiedBadge';
import { toProxyImageUrl } from '@/lib/imageProxy';
import { chipClass, sectionClass } from './styles';
import { getOrgVisibility, type OrgPublicProfile } from './types';

interface OrgHeroProps {
  org: OrgPublicProfile;
  onWebsiteClick: () => void;
}

function MetaChip({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <span className={chipClass} title={`${label}: ${value}`}>
      <Icon className='h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400' />
      <span className='max-w-[16rem] truncate'>{value}</span>
    </span>
  );
}

export default function OrgHero({ org, onWebsiteClick }: OrgHeroProps) {
  const visibility = getOrgVisibility(org.type);

  return (
    <section className={sectionClass}>
      <div className='flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between'>
        <div className='min-w-0 flex-1'>
          <div className='flex items-start gap-4 sm:gap-5'>
            <div className='relative h-20 w-20 shrink-0 rounded-xl border border-[var(--app-border)] bg-slate-50 p-2.5 shadow-sm dark:bg-slate-900/50 sm:h-24 sm:w-24'>
              {org.logo && !org.logo.includes('via.placeholder.com') ? (
                <Image
                  key={org.logo}
                  src={toProxyImageUrl(org.logo)}
                  alt={org.name}
                  fill
                  className='rounded-xl object-contain p-2'
                  sizes='(max-width: 768px) 80px, 96px'
                />
              ) : (
                <div className='flex h-full w-full items-center justify-center rounded-xl bg-slate-100/80 dark:bg-white/5'>
                  <Building2 className='h-9 w-9 text-slate-400 dark:text-slate-500' />
                </div>
              )}
            </div>

            <div className='min-w-0 flex-1'>
              <div className='flex flex-wrap items-center gap-2.5'>
                <h1 className='text-2xl font-bold leading-tight text-slate-900 dark:text-white sm:text-3xl lg:text-[2rem]'>
                  {org.name}
                </h1>
                {org.isVerified ? <VerifiedBadge /> : null}
              </div>

              <div className='mt-4 flex flex-wrap gap-2.5'>
                <MetaChip
                  label='Country'
                  value={org.country?.name || '—'}
                  icon={MapPin}
                />
                <MetaChip
                  label='Category'
                  value={org.category?.name || '—'}
                  icon={Tag}
                />
                <MetaChip label='Visibility' value={visibility} icon={Eye} />
              </div>
            </div>
          </div>
        </div>

        {org.website ? (
          <div className='w-full lg:w-auto lg:shrink-0'>
            <button
              type='button'
              onClick={onWebsiteClick}
              aria-label='Open official verified website in a new tab'
              className='inline-flex w-full items-center justify-center gap-2 rounded-xl btn-primary px-5 py-3 text-sm font-semibold shadow-lg shadow-blue-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--btn-primary)]/30 lg:w-auto'
            >
              Official Verified Website
              <ExternalLink className='h-4 w-4' aria-hidden='true' />
            </button>
          </div>
        ) : (
          <div className='inline-flex items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-50/80 px-4 py-2 text-xs font-medium text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'>
            <ShieldCheck className='h-4 w-4' />
            Official website unavailable
          </div>
        )}
      </div>
    </section>
  );
}
