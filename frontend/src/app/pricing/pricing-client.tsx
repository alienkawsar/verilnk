'use client';

import { useEffect, useMemo, useState, Fragment } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { formatCurrencyFromCents } from '@/lib/currency';
import SignupModal from '@/components/auth/SignupModal';
import BillingCadenceToggle from '@/components/billing/BillingCadenceToggle';
import {
  Check,
  ShieldCheck,
  Star,
  Zap,
  LifeBuoy,
  ChevronDown,
  Minus,
  Users,
  Lock,
  Building2
} from 'lucide-react';

const plans = [
  {
    key: 'BASIC',
    name: 'Basic',
    description: 'Verified presence for trusted discovery.',
    price: 49,
    originalPrice: 69,
    billing: '/mo',
    note: 'Manual verification required',
    cta: 'Upgrade to Basic',
    href: '/org/upgrade?plan=BASIC',
    highlight: false,
    features: [
      'Verified badge',
      'Public Organization Page',
      'Basic analytics',
      'Email Support',
      'Normal Priority Visibility',
    ],
    planInfo: [
      'Admin-reviewed approvals.',
      'Verified badge for paid plans.',
      'Audit logs on admin actions.',
    ],
  },
  {
    key: 'PRO',
    name: 'Pro',
    description: 'Growth tools for high‑intent traffic.',
    price: 99,
    originalPrice: 129,
    billing: '/mo',
    note: 'Priority boost for 30 days',
    cta: 'Start Pro',
    href: '/org/upgrade?plan=PRO',
    highlight: true,
    features: [
      'Verified Badge',
      'Public Organization Page',
      'Advanced Analytics',
      'Reports Export',
      '30 Day High Priority Visibility',
      'Live chat (Queued)',
    ],
    planInfo: [
      'Admin-reviewed approvals.',
      'Verified badge for paid plans.',
      'Audit logs on admin actions.',
    ],
  },
  {
    key: 'BUSINESS',
    name: 'Business',
    description: 'Authority placement and premium support.',
    price: 199,
    billing: '/mo',
    note: 'Featured placement included',
    cta: 'Upgrade to Business',
    href: '/org/upgrade?plan=BUSINESS',
    highlight: false,
    features: [
      'Verified Badge',
      'Public Organization Page',
      'Advanced Analytics',
      'Always High Priority',
      'Instant Support',
      'Reputation Insights',
    ],
    planInfo: [
      'Admin-reviewed approvals.',
      'Verified badge for paid plans.',
      'Audit logs on admin actions.',
    ],
  },
  {
    key: 'ENTERPRISE',
    name: 'Enterprise',
    description: 'Custom scale, compliance, and control.',
    price: 'Custom',
    billing: '',
    note: 'Dedicated infrastructure',
    cta: 'Contact Sales',
    href: '/contact',
    highlight: false,
    isContact: true,
    features: [
      'White‑label Option',
      'Multi‑org Management',
      'Custom SLA',
      'API Access',
      'Dedicated Support',
    ],
    planInfo: [
      'Admin-reviewed approvals.',
      'Verified badge for paid plans.',
      'Audit logs on admin actions.',
    ],
  },
];

const featureCategories = [
  {
    name: 'Core listing & trust',
    features: [
      { name: 'Manual verification required', basic: 'Yes', pro: 'Yes', business: 'Yes', enterprise: 'Yes' },
      { name: 'Approved listing', basic: 'Yes', pro: 'Yes', business: 'Yes', enterprise: 'Yes' },
      { name: 'Verified badge on public profile', basic: 'Yes', pro: 'Yes', business: 'Yes', enterprise: 'Yes' },
      { name: 'Public organization page', basic: 'Yes', pro: 'Yes', business: 'Yes', enterprise: 'Yes' },
    ]
  },
  {
    name: 'Analytics',
    features: [
      { name: 'Analytics dashboard', basic: 'Basic', pro: 'Advanced', business: 'Advanced+', enterprise: 'Custom' },
    ]
  },
  {
    name: 'Priority & ranking',
    features: [
      { name: 'Search priority', basic: 'Normal', pro: 'Boosted (30 days)', business: 'High (always)', enterprise: 'Custom SLA' },
    ]
  },
  {
    name: 'Support',
    features: [
      { name: 'Support', basic: 'Email', pro: 'Live chat (queue)', business: 'Priority chat', enterprise: 'Dedicated support' },
    ]
  },
  {
    name: 'Exports / tools',
    features: [
      { name: 'Export reports', basic: false, pro: true, business: true, enterprise: true },
    ]
  },
  {
    name: 'Customization',
    features: [
      { name: 'Profile highlight', basic: false, pro: false, business: true, enterprise: 'Custom' },
    ]
  },
  {
    name: 'Integrations',
    features: [
      { name: 'API access', basic: false, pro: false, business: false, enterprise: true },
    ]
  },
  {
    name: 'Security',
    features: [
      { name: 'Audit log visibility (org)', basic: false, pro: 'Limited', business: 'Extended', enterprise: 'Full' },
    ]
  }
];

const highlights = [
  {
    title: 'Manual verification, always',
    description:
      'Every organization is reviewed by VeriLnk admins before activation. Paid plans never bypass review.',
    icon: ShieldCheck,
  },
  {
    title: 'Actionable analytics',
    description:
      'Track real demand with verified traffic. Upgrade for advanced insights and exports.',
    icon: Zap,
  },
  {
    title: 'Priority visibility',
    description:
      'Move higher in search and listings with plan-based priority and featured placement.',
    icon: Star,
  },
  {
    title: 'Support that scales',
    description:
      'From email support to dedicated managers, pick the tier that matches your growth.',
    icon: LifeBuoy,
  },
];

const faqs = [
  {
    q: 'Do paid plans bypass verification?',
    a: 'No. All organizations are manually reviewed before activation, regardless of plan.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. You can cancel or downgrade at any time. Access remains until the end of your current period.',
  },
  {
    q: 'What happens when a plan expires?',
    a: 'Your organization is automatically downgraded to FREE and premium features are disabled.',
  },
  {
    q: 'Do you offer trials?',
    a: 'Trials are available for eligible organizations and include Pro features with limited exports.',
  },
  {
    q: 'What payment methods are supported?',
    a: 'We are preparing gateway integrations. For now, billing is handled manually by the VeriLnk team.',
  },
];

const RenderFeatureValue = ({ value }: { value: string | boolean }) => {
  if (value === true || value === 'Yes') return <Check className="w-5 h-5 text-emerald-500 mx-auto" />;
  if (value === false) return <Minus className="w-5 h-5 text-slate-300 mx-auto" />;
  return <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{value}</span>;
};

type UpgradePlan = 'BASIC' | 'PRO' | 'BUSINESS';
type BillingCycle = 'monthly' | 'annual';

const UPGRADE_PLAN_VALUES = new Set<UpgradePlan>(['BASIC', 'PRO', 'BUSINESS']);

const isUpgradePlan = (value: string | null | undefined): value is UpgradePlan =>
  Boolean(value && UPGRADE_PLAN_VALUES.has(value as UpgradePlan));

const normalizeUpgradeBilling = (value: string | null | undefined): BillingCycle =>
  value === 'annual' ? 'annual' : 'monthly';

export default function PricingClient() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [orgRequiredOpen, setOrgRequiredOpen] = useState(false);
  const [orgSignupOpen, setOrgSignupOpen] = useState(false);
  const [pendingUpgrade, setPendingUpgrade] = useState<{ plan: UpgradePlan; billing: BillingCycle } | null>(null);

  const upgradePlanFromQuery = searchParams.get('upgradePlan');
  const upgradeBillingFromQuery = normalizeUpgradeBilling(searchParams.get('upgradeBilling'));
  const shouldOpenOrgSignup = searchParams.get('createOrg') === 'true';

  const clearUpgradeIntentParams = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('upgradePlan');
    params.delete('upgradeBilling');
    params.delete('createOrg');
    const next = params.toString();
    router.replace(next ? `/pricing?${next}` : '/pricing');
  };

  const resolveUpgradePlanFromHref = (href: string): UpgradePlan | null => {
    try {
      const parsed = new URL(href, 'http://localhost');
      const plan = parsed.searchParams.get('plan');
      if (!isUpgradePlan(plan)) return null;
      return plan;
    } catch {
      return null;
    }
  };

  const buildUpgradeIntentPath = (plan: UpgradePlan, cycle: BillingCycle, includeCreateOrg: boolean = false) => {
    const params = new URLSearchParams();
    params.set('upgradePlan', plan);
    params.set('upgradeBilling', cycle);
    if (includeCreateOrg) {
      params.set('createOrg', 'true');
    }
    return `/pricing?${params.toString()}`;
  };

  const pendingUpgradeIntentPath = useMemo(() => {
    if (!pendingUpgrade) return '/pricing';
    return buildUpgradeIntentPath(pendingUpgrade.plan, pendingUpgrade.billing);
  }, [pendingUpgrade]);

  useEffect(() => {
    if (shouldOpenOrgSignup) {
      setOrgSignupOpen(true);
    }
  }, [shouldOpenOrgSignup]);

  useEffect(() => {
    if (!isUpgradePlan(upgradePlanFromQuery) || loading) {
      return;
    }

    const intentPlan = upgradePlanFromQuery;
    const intentBilling = upgradeBillingFromQuery;
    if (billingCycle !== intentBilling) {
      setBillingCycle(intentBilling);
    }

    if (!user) {
      router.replace(`/signin?next=${encodeURIComponent(buildUpgradeIntentPath(intentPlan, intentBilling))}`);
      return;
    }

    if (!user.organizationId) {
      setPendingUpgrade({ plan: intentPlan, billing: intentBilling });
      setOrgRequiredOpen(true);
      return;
    }

    router.replace(`/org/upgrade?plan=${intentPlan}&billing=${intentBilling}`);
  }, [upgradePlanFromQuery, upgradeBillingFromQuery, loading, user, router, billingCycle]);

  const handleUpgrade = (href: string, isContact?: boolean) => {
    if (isContact) {
      router.push(href);
      return;
    }

    const targetPlan = resolveUpgradePlanFromHref(href);
    const intentPath = targetPlan ? buildUpgradeIntentPath(targetPlan, billingCycle) : '/pricing';

    if (!user) {
      router.push(`/?login=true&returnTo=${encodeURIComponent(intentPath)}`); // Redirect to home with login trigger and return path
      return;
    }

    if (!user.organizationId && targetPlan) {
      setPendingUpgrade({ plan: targetPlan, billing: billingCycle });
      setOrgRequiredOpen(true);
      return;
    }

    // User is logged in
    const separator = href.includes('?') ? '&' : '?';
    router.push(`${href}${separator}billing=${billingCycle}`);
  };

  const toCents = (value: number) => Math.round(value * 100);

  const formatPrice = (price: number | string) => {
    if (typeof price === 'string') return price;
    const monthlyCents = toCents(price);
    if (billingCycle === 'annual') {
      // Annual price = Monthly * 12 * 0.9 (10% discount)
      const annualCents = Math.round(monthlyCents * 12 * 0.9);
      return formatCurrencyFromCents(annualCents, 'USD');
    }
    return formatCurrencyFromCents(monthlyCents, 'USD');
  };

  const getBillingText = (price: number | string) => {
    if (typeof price === 'string') return '';
    return billingCycle === 'annual' ? '/yr' : '/mo';
  };

  const handleSignInAsOrganization = () => {
    setOrgRequiredOpen(false);
    const next = pendingUpgradeIntentPath;
    router.push(`/signin?next=${encodeURIComponent(next)}&force=true`);
  };

  const handleCreateOrganization = () => {
    setOrgRequiredOpen(false);
    if (pendingUpgrade) {
      router.push(buildUpgradeIntentPath(pendingUpgrade.plan, pendingUpgrade.billing, true));
      return;
    }
    router.push('/pricing?createOrg=true');
  };

  const handleBackToPricing = () => {
    setOrgRequiredOpen(false);
    setPendingUpgrade(null);
    clearUpgradeIntentParams();
  };

  return (
    <div className='min-h-screen bg-slate-50 dark:bg-slate-900 pb-20'>
      {/* Discovery note (frontend/src/app/pricing/pricing-client.tsx):
          Upgrade CTA previously only checked "logged in" and allowed individual users to continue.
          Existing real routes: sign-in entry /signin (redirects to /?login=true...), organization upgrade /org/upgrade, pricing page /pricing. */}
      <div className='pt-24 pb-16 px-4'>
        <div className='max-w-7xl mx-auto px-4 text-center'>
          <div className='inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-semibold uppercase tracking-wide'>
            <ShieldCheck className='w-4 h-4' />
            Verified organizations, trusted globally
          </div>
          <h1 className='mt-6 text-4xl md:text-5xl font-bold text-slate-900 dark:text-white'>
            Choose a plan that fits your organization
          </h1>
          <p className='mt-4 text-slate-600 dark:text-slate-300 max-w-2xl mx-auto'>
            Every plan starts with strict verification. Upgrade for better
            visibility, analytics, and dedicated support.
          </p>

          {/* Billing Toggle */}
          <div className="mt-10 flex justify-center items-center">
            <BillingCadenceToggle value={billingCycle} onChange={setBillingCycle} />
          </div>

        </div>
      </div>

      <div id='plans' className='max-w-7xl mx-auto px-4'>
        {/* Plans Grid */}
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
          {plans.map((plan) => (
            <div
              key={plan.key}
              className={`relative rounded-2xl p-6 shadow-sm surface-card flex flex-col h-full ${plan.highlight ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-[var(--app-border)]'}`}
            >
              {plan.highlight && (
                <span className='absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full btn-primary text-xs font-semibold whitespace-nowrap'>
                  Recommended
                </span>
              )}
              <div className='flex flex-col gap-1 mb-4 text-center'>
                <h3 className='text-lg font-bold text-slate-900 dark:text-white'>
                  {plan.name}
                </h3>
                <p className='text-sm text-slate-500 dark:text-slate-400 min-h-[40px]'>
                  {plan.description}
                </p>
              </div>

              <div className='flex items-end justify-center gap-1 mb-6'>
                <span className='text-4xl font-bold text-slate-900 dark:text-white'>
                  {formatPrice(plan.price)}
                </span>
                <span className='pb-1 text-sm text-slate-500 dark:text-slate-400'>
                  {getBillingText(plan.price)}
                </span>
              </div>

              {/* Annual Savings Text */}
              {billingCycle === 'annual' && typeof plan.price === 'number' && (
                <p className="text-center text-xs text-emerald-600 dark:text-emerald-400 font-medium -mt-4 mb-4">
                  Save {formatCurrencyFromCents(
                    Math.round(toCents(plan.price) * 12) - Math.round(toCents(plan.price) * 12 * 0.9),
                    'USD',
                  )} per year
                </p>
              )}

              <button
                onClick={() => handleUpgrade(plan.href, (plan as any).isContact)}
                className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors mb-6 ${plan.highlight ? 'btn-primary shadow-md shadow-blue-500/20' : 'border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
              >
                {plan.cta}
              </button>

              <div className='border-t border-slate-100 dark:border-slate-700/50 pt-6 mt-auto'>
                <p className='text-[10px] uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500 mb-3 text-center'>
                  Key Features
                </p>
                <ul className='space-y-3 text-sm text-slate-600 dark:text-slate-300'>
                  {plan.features.map((feature) => (
                    <li key={feature} className='flex items-start gap-3'>
                      <Check className='w-4 h-4 text-emerald-500 mt-0.5 shrink-0' />
                      <span className="text-left">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        {/* Comparison Table */}
        <div className="mt-24 mb-16">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-4">Compare Plans</h2>
            <p className="text-slate-600 dark:text-slate-400">Detailed feature breakdown for every stage of growth.</p>
          </div>

          <div className="overflow-x-auto rounded-2xl border-[var(--app-border)] surface-card shadow-sm">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
                  <th className="p-4 md:p-6 w-1/4 font-semibold text-slate-900 dark:text-white">Features</th>
                  <th className="p-4 md:p-6 w-[18.75%] text-center font-semibold text-slate-900 dark:text-white">Basic</th>
                  <th className="p-4 md:p-6 w-[18.75%] text-center font-semibold text-slate-900 dark:text-white text-blue-600 dark:text-blue-400">Pro</th>
                  <th className="p-4 md:p-6 w-[18.75%] text-center font-semibold text-slate-900 dark:text-white">Business</th>
                  <th className="p-4 md:p-6 w-[18.75%] text-center font-semibold text-slate-900 dark:text-white">Enterprise</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {featureCategories.map((category) => (
                  <Fragment key={category.name}>
                    <tr className="bg-slate-50 dark:bg-slate-900/30">
                      <td colSpan={5} className="p-3 md:px-6 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {category.name}
                      </td>
                    </tr>
                    {category.features.map((feat: any) => (
                      <tr key={feat.name} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="p-4 md:px-6 text-sm font-medium text-slate-700 dark:text-slate-200">
                          {feat.name}
                        </td>
                        <td className="p-4 md:px-6 text-center align-middle">
                          <RenderFeatureValue value={feat.basic} />
                        </td>
                        <td className="p-4 md:px-6 text-center align-middle bg-blue-50/10 dark:bg-blue-900/5">
                          <RenderFeatureValue value={feat.pro} />
                        </td>
                        <td className="p-4 md:px-6 text-center align-middle">
                          <RenderFeatureValue value={feat.business} />
                        </td>
                        <td className="p-4 md:px-6 text-center align-middle">
                          <RenderFeatureValue value={feat.enterprise} />
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className='max-w-7xl mx-auto px-4 mt-16 grid gap-6 md:grid-cols-2'>
        {highlights.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.title}
              className='surface-card rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow'
            >
              <div className='flex items-center gap-4'>
                <div className='h-12 w-12 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center'>
                  <Icon className='w-6 h-6 text-blue-600 dark:text-blue-300' />
                </div>
                <div>
                  <h3 className='text-lg font-bold text-slate-900 dark:text-white'>
                    {item.title}
                  </h3>
                </div>
              </div>
              <p className='mt-4 text-slate-600 dark:text-slate-300 leading-relaxed'>
                {item.description}
              </p>
            </div>
          );
        })}
      </div>

      <div className='max-w-7xl mx-auto px-4 mt-24'>
        <div className='surface-card rounded-2xl p-8 md:p-12 shadow-sm'>
          <div className='flex items-center gap-3 mb-8 justify-center'>
            <Users className='w-6 h-6 text-blue-500' />
            <h2 className='text-2xl md:text-3xl font-bold text-slate-900 dark:text-white text-center'>
              Frequently asked questions
            </h2>
          </div>
          <div className='w-full divide-y divide-slate-200 dark:divide-slate-700'>
            {faqs.map((item, index) => {
              const isOpen = openIndex === index;
              return (
                <div key={item.q} className='py-5'>
                  <button
                    type='button'
                    className='w-full flex items-center justify-between text-left text-base font-semibold text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors'
                    aria-expanded={isOpen}
                    aria-controls={`faq-panel-${index}`}
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                  >
                    <span>{item.q}</span>
                    <ChevronDown
                      className={`w-5 h-5 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  <div
                    id={`faq-panel-${index}`}
                    className={`grid transition-all duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100 mt-3' : 'grid-rows-[0fr] opacity-0'}`}
                  >
                    <div className='overflow-hidden'>
                      <p className='text-slate-600 dark:text-slate-300 leading-relaxed'>
                        {item.a}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {orgRequiredOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="relative w-full max-w-lg surface-card rounded-2xl border border-[var(--app-border)] shadow-2xl p-6 sm:p-7">
            {/* Discovery note (frontend/src/app/pricing/pricing-client.tsx):
                Organization-required modal is rendered directly on Pricing and already uses modal token rounded-2xl.
                Action row refactored to vertical hierarchy (primary/secondary/tertiary) with full-width controls. */}
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div className="min-w-0 max-w-md">
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
                  Organization account required
                </h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  Organization account required. Please sign in to your organization account or create one.
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={handleSignInAsOrganization}
                className="w-full h-11 btn-primary px-4 rounded-lg text-sm font-medium inline-flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#187DE9]/45"
              >
                <ShieldCheck className="w-4 h-4" />
                Sign in as Organization
              </button>
              <button
                type="button"
                onClick={handleCreateOrganization}
                className="w-full h-11 px-4 rounded-lg border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] text-sm font-medium inline-flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#187DE9]/35"
              >
                <Building2 className="w-4 h-4" />
                Create Organization
              </button>
              <div className="pt-1 border-t border-[var(--app-border)]/70">
                <button
                  type="button"
                  onClick={handleBackToPricing}
                  className="w-full h-10 px-4 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-[var(--app-surface-hover)] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#187DE9]/30"
                >
                  Back to Pricing
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <SignupModal
        isOpen={orgSignupOpen}
        defaultType="ORGANIZATION"
        onClose={() => {
          setOrgSignupOpen(false);
          const params = new URLSearchParams(searchParams.toString());
          params.delete('createOrg');
          const next = params.toString();
          router.replace(next ? `/pricing?${next}` : '/pricing');
        }}
        onSwitchToLogin={handleSignInAsOrganization}
      />
    </div>
  );
}
