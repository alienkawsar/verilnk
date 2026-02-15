'use client';

import Link from 'next/link';
import Image from 'next/image';

import { useState, useEffect } from 'react';
import {
  Shield,
  ShieldUser,
  Landmark,
  Users,
  Globe,
  Tag,
  FileText,
  Link as LinkIcon,
  LogOut,
  MapPin,
  Building2,
  CheckSquare,
  Flag,
  Key,
  Receipt,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { logoutAdmin, fetchAdminMe } from '@/lib/api';
import { getInitials } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useTheme } from '@/context/ThemeContext';

import CountriesSection from '@/components/admin/sections/CountriesSection';
import CategoriesSection from '@/components/admin/sections/CategoriesSection';
import SitesSection from '@/components/admin/sections/SitesSection';
import ReportsSection from '@/components/admin/sections/ReportsSection';
import UrlsSection from '@/components/admin/sections/UrlsSection';
import StatesSection from '@/components/admin/sections/StatesSection';
import AdminsSection from '@/components/admin/sections/AdminsSection';
import UsersSection from '@/components/admin/sections/UsersSection';
import AccountSection from '@/components/admin/sections/AccountSection';
import OrganizationsSection from '@/components/admin/sections/OrganizationsSection';
import RequestsSection from '@/components/admin/sections/RequestsSection';
import AuditLogsSection from '@/components/admin/sections/AuditLogsSection';
import ComplianceSection from '@/components/admin/sections/ComplianceSection';
import AdminSessionsSection from '@/components/admin/sections/AdminSessionsSection';
import EnterpriseSection from '@/components/admin/sections/EnterpriseSection';
import BillingSection from '@/components/admin/sections/BillingSection';

type AdminSection =
  | 'SITES'
  | 'COUNTRIES'
  | 'STATES'
  | 'CATEGORIES'
  | 'REPORTS'
  | 'URLS'
  | 'ADMINS'
  | 'USERS'
  | 'ORGANIZATIONS'
  | 'ACCOUNT'
  | 'REQUESTS'
  | 'LOGS'
  | 'COMPLIANCE'
  | 'SESSIONS'
  | 'BILLING'
  | 'ENTERPRISE';

const ADMIN_SIDEBAR_COLLAPSE_STORAGE_KEY = 'verilnk_admin_sidebar_collapsed';

export default function AdminDashboard({
  initialSection,
}: {
  initialSection?: AdminSection;
}) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [activeSection, setActiveSection] = useState<AdminSection>(
    initialSection || 'SITES',
  );
  const [adminUser, setAdminUser] = useState<{
    firstName?: string;
    lastName?: string;
    email: string;
    role: string;
  } | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!mounted) return;
    try {
      const saved = window.localStorage.getItem(
        ADMIN_SIDEBAR_COLLAPSE_STORAGE_KEY,
      );
      if (saved === '1') {
        setIsSidebarCollapsed(true);
      }
    } catch (error) {
      console.error('Failed to read sidebar preference', error);
    }
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    try {
      window.localStorage.setItem(
        ADMIN_SIDEBAR_COLLAPSE_STORAGE_KEY,
        isSidebarCollapsed ? '1' : '0',
      );
    } catch (error) {
      console.error('Failed to persist sidebar preference', error);
    }
  }, [isSidebarCollapsed, mounted]);

  useEffect(() => {
    fetchAdminMe()
      .then((data) => {
        if (data?.user) {
          setAdminUser(data.user);
        }
      })
      .catch(console.error);
  }, []);

  const handleLogout = async () => {
    try {
      await logoutAdmin();
    } catch (error) {
      console.error('Logout failed', error);
    }
    router.push('/admin/login');
    router.refresh();
  };

  const potentialNavItems = [
    {
      id: 'SITES',
      name: 'Review Queue',
      icon: CheckSquare,
      roles: ['SUPER_ADMIN', 'MODERATOR', 'VERIFIER'],
    },
    {
      id: 'REQUESTS',
      name: 'Requests Hub',
      icon: FileText,
      roles: ['SUPER_ADMIN', 'MODERATOR'],
    },
    {
      id: 'REPORTS',
      name: 'Reports',
      icon: Flag,
      roles: ['SUPER_ADMIN', 'MODERATOR', 'VERIFIER'],
    },
    {
      id: 'URLS',
      name: 'URL Manager',
      icon: LinkIcon,
      roles: ['SUPER_ADMIN', 'MODERATOR'],
    },
    {
      id: 'COUNTRIES',
      name: 'Countries',
      icon: Globe,
      roles: ['SUPER_ADMIN', 'MODERATOR'],
    },
    {
      id: 'STATES',
      name: 'States',
      icon: MapPin,
      roles: ['SUPER_ADMIN', 'MODERATOR'],
    },
    {
      id: 'CATEGORIES',
      name: 'Categories',
      icon: Tag,
      roles: ['SUPER_ADMIN', 'MODERATOR'],
    },
    {
      id: 'ADMINS',
      name: 'Manage Admins',
      icon: ShieldUser,
      roles: ['SUPER_ADMIN'],
    },
    { id: 'USERS', name: 'Manage Users', icon: Users, roles: ['SUPER_ADMIN'] },
    {
      id: 'ORGANIZATIONS',
      name: 'Manage Organizations',
      icon: Building2,
      roles: ['SUPER_ADMIN'],
    },
    { id: 'LOGS', name: 'Admin Logs', icon: FileText, roles: ['SUPER_ADMIN'] },
    {
      id: 'COMPLIANCE',
      name: 'Compliance',
      icon: Shield,
      roles: ['SUPER_ADMIN'],
    },
    {
      id: 'SESSIONS',
      name: 'Admin Sessions',
      icon: Key,
      roles: ['SUPER_ADMIN'],
    },
    {
      id: 'ENTERPRISE',
      name: 'Enterprise Management',
      icon: Landmark,
      roles: ['SUPER_ADMIN'],
    },
    {
      id: 'BILLING',
      name: 'Billing',
      icon: Receipt,
      roles: ['SUPER_ADMIN'],
    },
  ];

  // Group Definitions
  const sidebarGroups = [
    {
      title: 'Queues & Reports',
      items: ['SITES', 'REPORTS', 'REQUESTS'],
    },
    {
      title: 'Admin Controls',
      items: ['ADMINS', 'SESSIONS', 'LOGS', 'COMPLIANCE'],
    },
    {
      title: 'Directory Management',
      items: ['URLS', 'COUNTRIES', 'STATES', 'CATEGORIES'],
    },
    {
      title: 'Accounts & Orgs',
      items: ['ENTERPRISE', 'ORGANIZATIONS', 'BILLING', 'USERS'],
    },
  ];

  const navItems = potentialNavItems.filter(
    (item) => adminUser && item.roles.includes(adminUser.role),
  );

  const renderSection = () => {
    switch (activeSection) {
      case 'SITES':
        return <SitesSection />;
      case 'COUNTRIES':
        return <CountriesSection />;
      case 'STATES':
        return <StatesSection />;
      case 'CATEGORIES':
        return <CategoriesSection />;
      case 'REPORTS':
        return <ReportsSection />;
      case 'URLS':
        // @ts-expect-error: Component prop types mismatch but runtime behavior is correct
        return <UrlsSection user={adminUser} />;
      case 'ADMINS':
        // Double check protection
        if (adminUser?.role !== 'SUPER_ADMIN') return <SitesSection />;
        return <AdminsSection />;
      case 'USERS':
        if (adminUser?.role !== 'SUPER_ADMIN') return <SitesSection />;
        return <UsersSection />;
      case 'ORGANIZATIONS':
        if (adminUser?.role !== 'SUPER_ADMIN') return <SitesSection />;
        return <OrganizationsSection currentUser={adminUser} />;
      case 'REQUESTS':
        return <RequestsSection />;
      case 'LOGS':
        return <AuditLogsSection />;
      case 'COMPLIANCE':
        if (adminUser?.role !== 'SUPER_ADMIN') return <SitesSection />;
        return <ComplianceSection />;
      case 'SESSIONS':
        if (adminUser?.role !== 'SUPER_ADMIN') return <SitesSection />;
        return <AdminSessionsSection />;
      case 'ENTERPRISE':
        if (adminUser?.role !== 'SUPER_ADMIN') return <SitesSection />;
        return <EnterpriseSection />;
      case 'BILLING':
        if (adminUser?.role !== 'SUPER_ADMIN') return <SitesSection />;
        return <BillingSection />;
      case 'ACCOUNT':
        return <AccountSection user={adminUser} />;
      default:
        return <SitesSection />;
    }
  };

  return (
    <div className='flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden transition-colors duration-300'>
      {/* Sidebar */}
      <aside
        className={`${
          isSidebarCollapsed ? 'w-20' : 'w-64'
        } border-r border-slate-200 dark:border-slate-800 bg-app-secondary flex flex-col transition-all duration-300`}
      >
        <div className={`${isSidebarCollapsed ? 'p-4 pb-2' : 'p-6 pb-2'}`}>
          <div
            className={`flex ${
              isSidebarCollapsed ? 'justify-center' : 'justify-end'
            } mb-3`}
          >
            <button
              type='button'
              onClick={() => setIsSidebarCollapsed((value) => !value)}
              className='h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center'
              title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={
                isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'
              }
            >
              {isSidebarCollapsed ? (
                <ChevronRight className='w-4 h-4' />
              ) : (
                <ChevronLeft className='w-4 h-4' />
              )}
            </button>
          </div>
          <Link
            href='/'
            className={`block ${isSidebarCollapsed ? 'mx-auto' : ''}`}
          >
            <div
              className={`relative ${
                isSidebarCollapsed
                  ? 'h-10 w-10 mb-4'
                  : 'h-12 w-auto aspect-[3/1] mb-6'
              }`}
            >
              {mounted ? (
                <Image
                  src={
                    resolvedTheme === 'dark'
                      ? '/VERILNK_DARK.png'
                      : '/VERILNK_LIGHT.png'
                  }
                  alt='VeriLnk Admin'
                  fill
                  className={`object-contain ${
                    isSidebarCollapsed ? 'object-center' : 'object-left'
                  }`}
                  sizes='(min-width: 768px) 160px, 128px'
                  priority
                />
              ) : (
                <Skeleton className='w-full h-full rounded' />
              )}
            </div>
          </Link>
          {!isSidebarCollapsed && (
            <div className='flex items-center gap-2 mb-3'>
              <span className='px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-[10px] font-bold uppercase tracking-wider'>
                ADMIN DASHBOARD
              </span>
              <span className='text-[10px] text-slate-500 dark:text-slate-600'>
                v1.2
              </span>
            </div>
          )}
        </div>

        <nav
          className={`flex-1 ${
            isSidebarCollapsed ? 'px-2 space-y-3' : 'px-4 space-y-6'
          } overflow-y-auto py-4`}
        >
          {sidebarGroups.map((group, groupIndex) => {
            // Filter items in this group that the user has access to
            const groupItems = group.items
              .map((id) => potentialNavItems.find((i) => i.id === id))
              .filter(
                (item) =>
                  item && adminUser && item.roles.includes(adminUser.role),
              );

            if (groupItems.length === 0) return null;

            return (
              <div key={group.title} className='space-y-1'>
                {/* Subtle Separator for groups after the first one */}
                {groupIndex > 0 && !isSidebarCollapsed && (
                  <div className='mx-2 mb-3 border-t border-slate-200 dark:border-slate-800/60' />
                )}

                {/* Group Title */}
                {!isSidebarCollapsed && (
                  <div className='px-4 text-[10px] font-bold text-slate-500 dark:text-slate-600 uppercase tracking-wider mb-2'>
                    {group.title}
                  </div>
                )}

                {groupItems.map((item, index) => {
                  // Safety check, though filtering above handles it
                  if (!item) return null;

                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={`${item.id}-${index}`}
                      onClick={() => setActiveSection(item.id as AdminSection)}
                      title={item.name}
                      className={`w-full flex items-center ${
                        isSidebarCollapsed
                          ? 'justify-center px-2'
                          : 'space-x-3 px-4'
                      } py-2.5 rounded-lg transition-all duration-200 text-left text-sm ${
                        isActive
                          ? 'bg-blue-600/10 text-blue-600 dark:text-blue-500 border border-blue-600/20'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <item.icon className='w-4 h-4' />
                      {!isSidebarCollapsed && (
                        <span className='font-medium'>{item.name}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div
          className={`${
            isSidebarCollapsed ? 'p-2' : 'p-4'
          } border-t border-slate-200 dark:border-slate-800`}
        >
          <button
            onClick={handleLogout}
            className={`flex items-center ${
              isSidebarCollapsed ? 'justify-center px-2' : 'space-x-3 px-4'
            } py-3 w-full rounded-lg text-slate-600 dark:text-slate-400 hover:bg-red-500/10 hover:text-red-500 dark:hover:text-red-400 transition-all duration-200`}
            title='Logout'
          >
            <LogOut className='w-5 h-5' />
            {!isSidebarCollapsed && <span className='font-medium'>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className='flex-1 overflow-auto bg-app transition-colors duration-300'>
        <header className='h-16 flex items-center justify-between px-8 surface-card sticky top-0 z-10 border-b border-[var(--app-border)]'>
          <div className='text-[var(--app-text-secondary)] text-sm'>
            Dashboard /{' '}
            <span className='text-[var(--app-text-primary)] font-medium'>
              {navItems.find((i) => i.id === activeSection)?.name}
            </span>
          </div>
          <div className='flex items-center gap-4'>
            {/* Role Badge */}
            {adminUser?.role && (
              <span className='px-2.5 py-1 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-bold uppercase tracking-wider hidden md:inline-block'>
                {adminUser.role.replace('_', ' ')}
              </span>
            )}

            {/* Theme Toggle in Middle */}
            <ThemeToggle />

            {/* Profile Dropdown/Button */}
            <button
              onClick={() => setActiveSection('ACCOUNT')}
              className={`flex items-center gap-3 transition-opacity hover:opacity-80 ${activeSection === 'ACCOUNT' ? 'opacity-80' : ''}`}
            >
              <div className='w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold text-white shadow-lg shadow-blue-500/20 dark:shadow-blue-900/20'>
                {adminUser
                  ? getInitials(
                      adminUser.firstName,
                      adminUser.lastName,
                      undefined,
                      adminUser.email,
                    )
                  : '...'}
              </div>
            </button>
          </div>
        </header>

        <div className='p-8'>
          <div className='container mx-auto'>{renderSection()}</div>
        </div>
      </main>
    </div>
  );
}
