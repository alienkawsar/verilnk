'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Landmark,
  LayoutDashboard,
  LogOut,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useTheme } from '@/context/ThemeContext';
import { logoutAdmin } from '@/lib/api';

const ADMIN_SIDEBAR_COLLAPSE_STORAGE_KEY = 'verilnk_admin_sidebar_collapsed';

export default function AdminEnterpriseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  const handleLogout = async () => {
    try {
      await logoutAdmin();
    } catch (error) {
      console.error('Logout failed', error);
    }
    router.push('/admin/login');
    router.refresh();
  };

  const navItems = [
    {
      href: '/admin/dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      active: pathname?.startsWith('/admin/dashboard') || pathname === '/admin',
    },
    {
      href: '/admin/enterprise',
      label: 'Enterprise',
      icon: Landmark,
      active: pathname?.startsWith('/admin/enterprise'),
    },
  ];

  return (
    <div className='flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden transition-colors duration-300'>
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
                ENTERPRISE
              </span>
              <span className='text-[10px] text-slate-500 dark:text-slate-600'>
                SUPER ADMIN
              </span>
            </div>
          )}
        </div>

        <nav
          className={`flex-1 ${
            isSidebarCollapsed ? 'px-2 space-y-2' : 'px-4 space-y-2'
          } overflow-y-auto py-4`}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={`w-full flex items-center ${
                  isSidebarCollapsed ? 'justify-center px-2' : 'space-x-3 px-4'
                } py-2.5 rounded-lg transition-all duration-200 text-left text-sm ${
                  item.active
                    ? 'bg-blue-600/10 text-blue-600 dark:text-blue-500 border border-blue-600/20'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className='w-4 h-4' />
                {!isSidebarCollapsed && <span className='font-medium'>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div
          className={`${
            isSidebarCollapsed ? 'p-2' : 'p-4'
          } border-t border-slate-200 dark:border-slate-800 space-y-2`}
        >
          <div className={`flex ${isSidebarCollapsed ? 'justify-center' : ''}`}>
            <ThemeToggle />
          </div>
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

      <main className='flex-1 overflow-auto bg-app transition-colors duration-300'>
        {children}
      </main>
    </div>
  );
}
