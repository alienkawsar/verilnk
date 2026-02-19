'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import {
  getPublicOrganization,
  trackView,
  trackClickFireAndForget,
} from '@/lib/api';
import NotFoundThemeImage from '@/components/shared/NotFoundThemeImage';
import OrgHero from './components/OrgHero';
import AboutSection from './components/AboutSection';
import ContactSection from './components/ContactSection';
import VerificationStatusCard from './components/VerificationStatusCard';
import TrustSummaryCard from './components/TrustSummaryCard';
import OrgDetailsCard from './components/OrgDetailsCard';
import type { OrgPublicProfile } from './components/types';
import {
  dividerClass,
  profileSurfaceClass,
} from './components/styles';

interface OrgProfileContentProps {
  initialData?: OrgPublicProfile | null;
}

interface PublicStateProps {
  title: string;
  description: string;
  secondaryDescription?: string;
  imageAlt: string;
}

function PublicState({
  title,
  description,
  secondaryDescription,
  imageAlt,
}: PublicStateProps) {
  return (
    <div className='min-h-screen bg-app px-4 py-10'>
      <div className='mx-auto flex min-h-[80vh] max-w-xl flex-col items-center justify-center text-center'>
        <NotFoundThemeImage
          alt={imageAlt}
          className='h-28 w-28 object-contain sm:h-32 sm:w-32'
        />
        <h1 className='mt-4 text-2xl font-bold text-slate-900 dark:text-white'>
          {title}
        </h1>
        <p className='mt-2 text-slate-600 dark:text-slate-400'>{description}</p>
        {secondaryDescription ? (
          <p className='mt-1 text-slate-600 dark:text-slate-400'>
            {secondaryDescription}
          </p>
        ) : null}
        <Link
          href='/'
          className='mt-8 inline-flex items-center gap-2 font-medium text-blue-600 transition-colors hover:text-blue-500 hover:underline dark:text-blue-400 dark:hover:text-blue-300'
        >
          <ArrowLeft className='h-4 w-4' />
          Return Home
        </Link>
      </div>
    </div>
  );
}

function OrgProfileContent({ initialData }: OrgProfileContentProps) {
  const params = useParams();
  const id = params?.id as string;

  const [org, setOrg] = useState<OrgPublicProfile | null>(initialData || null);
  const [loading, setLoading] = useState(!initialData);

  useEffect(() => {
    if (!id) return;

    const init = async () => {
      if (!initialData) {
        try {
          const data = await getPublicOrganization(id);
          setOrg(data);
        } catch (error) {
          console.error('Failed to load org', error);
        } finally {
          setLoading(false);
        }
      }

      try {
        await trackView(id);
      } catch {
        // Soft-fail analytics tracking for public pages.
      }
    };

    void init();
  }, [id, initialData]);

  const handleWebsiteClick = () => {
    if (org?.website && id) {
      trackClickFireAndForget(id);
      window.open(org.website, '_blank', 'noopener,noreferrer');
    }
  };

  if (loading) {
    return (
      <div className='min-h-screen bg-app flex items-center justify-center'>
        <Loader2 className='h-8 w-8 animate-spin text-blue-600 dark:text-blue-400' />
      </div>
    );
  }

  if (!org) {
    return (
      <PublicState
        title='Organization Not Found'
        description='The organization you are looking for does not exist or is not verified.'
        imageAlt='Organization not found'
      />
    );
  }

  if (org.isRestricted) {
    return (
      <PublicState
        title='Organization Restricted'
        description='Your organization is restricted. Please contact the admin.'
        secondaryDescription='If you are an admin, please contact support.'
        imageAlt='Organization restricted'
      />
    );
  }

  return (
    <div className='min-h-screen pb-16 bg-app'>
      <div className='relative bg-glow pt-24 pb-16 px-4 overflow-hidden'>
        <div className='relative z-10 mx-auto max-w-7xl sm:px-2 lg:px-4'>
        <div className={profileSurfaceClass}>
          <div className='relative p-6 sm:p-7 lg:p-8'>
            <OrgHero org={org} onWebsiteClick={handleWebsiteClick} />
            <div className={dividerClass} />

            <div className='grid gap-6 lg:grid-cols-5 lg:gap-8'>
              <div className='lg:col-span-3'>
                <AboutSection about={org.about} />
                <div className={dividerClass} />
                <ContactSection
                  address={org.address}
                  email={org.email}
                  phone={org.phone}
                />
              </div>

              <aside className='lg:col-span-2 lg:border-l lg:border-[var(--app-border)] lg:pl-8'>
                <VerificationStatusCard website={org.website} />
                <div className={dividerClass} />
                <TrustSummaryCard />
                <div className={dividerClass} />
                <OrgDetailsCard org={org} />
              </aside>
            </div>

            <div className={dividerClass} />
            <div className='pt-6'>
              <Link
                href='/'
                className='inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              >
                <ArrowLeft className='h-4 w-4' />
                Back to Directory
              </Link>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

export default function OrgProfileClient({ initialData }: OrgProfileContentProps) {
  return <OrgProfileContent initialData={initialData} />;
}
