import type { Metadata } from 'next';
import { ShieldCheck, Lock, EyeOff, MapPin } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'VeriLnk Privacy Policy: We do not collect personal data. Verified links, zero compromises on your privacy.',
  alternates: {
    canonical: '/privacy',
  },
  openGraph: {
    title: 'Privacy Policy | VeriLnk',
    description:
      'VeriLnk Privacy Policy: We do not collect personal data. Verified links, zero compromises on your privacy.',
    type: 'website',
  },
  twitter: {
    title: 'Privacy Policy | VeriLnk',
    description:
      'VeriLnk Privacy Policy: We do not collect personal data. Verified links, zero compromises on your privacy.',
  },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen text-slate-700 dark:text-slate-300 py-24 px-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header Section */}
        <div className='text-center mb-16 space-y-4'>
          <div className='inline-flex items-center justify-center p-3 bg-blue-500/10 rounded-2xl mb-4'>
            <Lock className='w-8 h-8 text-blue-600 dark:text-blue-400' />
          </div>
          <h1 className='text-4xl md:text-5xl font-bold text-slate-900 dark:text-white tracking-tight'>
            We Don't Want Your Data.
          </h1>
          <p className='text-xl text-blue-600 dark:text-blue-400 font-medium'>
            "Verified links, zero compromises on your privacy."
          </p>
          <p className='text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed'>
            VeriLnk is built on a simple premise: Security shouldn't require
            surveillance. We believe you should be able to verify official
            websites without handing over your digital identity.
          </p>
        </div>

        <div className='grid md:grid-cols-2 gap-8 mb-16'>
          <div className='bg-white dark:bg-slate-900/50 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none'>
            <div className='flex items-center gap-3 mb-4 text-slate-900 dark:text-white'>
              <EyeOff className='w-6 h-6 text-green-600 dark:text-green-400' />
              <h2 className='text-xl font-bold'>No Tracking</h2>
            </div>
            <p className='text-slate-600 dark:text-slate-400 leading-relaxed'>
              We do not use Google Analytics, Facebook Pixels, or any
              third-party trackers. We do not build profiles on our users. Your
              search history is yours alone.
            </p>
          </div>
          <div className='bg-white dark:bg-slate-900/50 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none'>
            <div className='flex items-center gap-3 mb-4 text-slate-900 dark:text-white'>
              <ShieldCheck className='w-6 h-6 text-purple-600 dark:text-purple-400' />
              <h2 className='text-xl font-bold'>Anonymous Reporting</h2>
            </div>
            <p className='text-slate-600 dark:text-slate-400 leading-relaxed'>
              Help keep VeriLnk safe by reporting fraudulent websites and
              recommending new verified sites. A registered account is required
              for these actions.
            </p>
          </div>
        </div>

        <div className='space-y-12 leading-relaxed border-t border-slate-200 dark:border-slate-900 pt-12'>
          <section>
            <h2 className='text-2xl font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2'>
              1. Data Collection Policy
            </h2>
            <p className='mb-4'>
              <strong>We do not collect personal data.</strong> When you visit
              VeriLnk, we don't ask for your name, email, or phone number unless
              you explicitly choose to create an account for advanced moderation
              features.
            </p>
            <p>
              For visitors, we only process the absolute minimum technical data
              required to serve the website (like your IP address strictly for
              showing local websites), which is never stored or linked to your
              identity.
            </p>
          </section>

          <section>
            <h2 className='text-2xl font-semibold text-slate-900 dark:text-white mb-4'>
              2. Cookies & Storage
            </h2>
            <p>
              We utilize <strong>zero tracking cookies</strong>. We use a single
              essential cookie only if you choose to log in, strictly to
              maintain your secure session. We do not sell, trade, or share your
              data with advertisers because we don't have any data to sell.
            </p>
          </section>

          <section>
            <h2 className='text-2xl font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2'>
              3. Location Data
            </h2>
            <p>
              <span className='inline-flex items-center gap-1 bg-slate-800 px-2 py-0.5 rounded text-xs text-white align-middle mr-1'>
                <MapPin className='w-3 h-3' /> Ephemeral only
              </span>
              We may detect your general region (Country, State level) solely to
              prioritize relevant websites for you (e.g., showing London, UK
              services if you access from London). This process happens on the
              fly and your location data is <strong>never stored</strong> in our
              database.
            </p>
          </section>

          <section>
            <h2 className='text-2xl font-semibold text-slate-900 dark:text-white mb-4'>
              4. Open Source & Transparency
            </h2>
            <p>
              We believe trust is earned through transparency. Our verification
              methodology is public. If you have specific privacy concerns, you
              can contact our privacy officer directly at
              <a
                href='mailto:privacy@verilnk.com'
                className='text-blue-400 hover:text-blue-300 ml-1'
              >
                privacy@verilnk.com
              </a>
              .
            </p>
          </section>

          <div className='pt-8 text-sm text-slate-500 border-t border-slate-200 dark:border-slate-800'>
            Last updated: January 30, 2026
          </div>
        </div>
      </div>
    </div>
  );
}
