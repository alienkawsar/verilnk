'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Building2,
  ChevronLeft,
  ChevronRight,
  Key,
  LayoutDashboard,
  Menu,
  Shield,
  Users,
  X,
} from 'lucide-react';
import { canAccessSection, type WorkspaceSection } from './section-types';

interface WorkspaceDashboardShellProps {
  workspace: { name: string; status: string };
  userRole: string;
  activeSection: string;
  onSectionChange: (section: string) => void;
  children: React.ReactNode;
}

type NavItem = {
  id: WorkspaceSection;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
};

const navItems: NavItem[] = [
  { id: 'overview', name: 'Overview', icon: LayoutDashboard },
  { id: 'analytics', name: 'Analytics', icon: BarChart3 },
  { id: 'usage', name: 'Usage', icon: Activity },
  { id: 'api-keys', name: 'API Keys', icon: Key },
  { id: 'members', name: 'Members', icon: Users },
  { id: 'organizations', name: 'Organizations', icon: Building2 },
  { id: 'security', name: 'Security', icon: Shield },
];

const sidebarGroups: Array<{ title: string; items: WorkspaceSection[] }> = [
  { title: 'Workspace', items: ['overview', 'analytics', 'usage', 'api-keys'] },
  { title: 'People', items: ['members', 'organizations'] },
  { title: 'Governance', items: ['security'] },
];

const sectionNameMap: Record<WorkspaceSection, string> = {
  overview: 'Overview',
  analytics: 'Analytics',
  usage: 'Usage',
  'api-keys': 'API Keys',
  members: 'Members',
  organizations: 'Organizations',
  security: 'Security',
};

function SidebarContent({
  isSidebarCollapsed,
  userRole,
  activeSection,
  onSectionChange,
  workspace,
  closeMobile,
}: {
  isSidebarCollapsed: boolean;
  userRole: string;
  activeSection: string;
  onSectionChange: (section: string) => void;
  workspace: { name: string; status: string };
  closeMobile?: () => void;
}) {
  return (
    <>
      <nav
        className={`flex-1 ${isSidebarCollapsed ? 'px-2 space-y-3' : 'px-4 space-y-6'} overflow-y-auto py-4`}
      >
        {sidebarGroups.map((group, groupIndex) => {
          const groupItems = group.items
            .filter((item) => canAccessSection(userRole, item))
            .map((id) => navItems.find((item) => item.id === id))
            .filter(Boolean) as NavItem[];

          if (groupItems.length === 0) return null;

          return (
            <div key={group.title} className='space-y-1'>
              {groupIndex > 0 && !isSidebarCollapsed && (
                <div className='mx-2 mb-3 border-t border-slate-200 dark:border-slate-800/60' />
              )}
              {!isSidebarCollapsed && (
                <div className='px-4 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-600 mb-2'>
                  {group.title}
                </div>
              )}
              {groupItems.map((item) => {
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type='button'
                    title={item.name}
                    onClick={() => {
                      onSectionChange(item.id);
                      closeMobile?.();
                    }}
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
        className={`${isSidebarCollapsed ? 'p-2' : 'p-4'} border-t border-slate-200 dark:border-slate-800`}
      >
        <Link
          href='/enterprise'
          className={`flex items-center ${
            isSidebarCollapsed ? 'justify-center px-2' : 'px-4'
          } py-2.5 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors`}
        >
          <span className='font-medium'>← Back to Portal</span>
        </Link>
      </div>
    </>
  );
}

export default function WorkspaceDashboardShell({
  workspace,
  userRole,
  activeSection,
  onSectionChange,
  children,
}: WorkspaceDashboardShellProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('verilnk_ws_sidebar_collapsed');
    setIsSidebarCollapsed(saved === 'true');
  }, []);

  useEffect(() => {
    localStorage.setItem(
      'verilnk_ws_sidebar_collapsed',
      String(isSidebarCollapsed),
    );
  }, [isSidebarCollapsed]);

  const activeSectionLabel = useMemo(() => {
    const section = activeSection as WorkspaceSection;
    return sectionNameMap[section] || 'Overview';
  }, [activeSection]);

  return (
    <div className='flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden transition-colors duration-300'>
      <aside
        className={`hidden md:flex ${
          isSidebarCollapsed ? 'w-20' : 'w-64'
        } border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex-col transition-all duration-300`}
      >
        <div className={`${isSidebarCollapsed ? 'p-4 pb-2' : 'p-6 pb-2'}`}>
          <div
            className={`flex ${isSidebarCollapsed ? 'justify-center' : 'justify-end'} mb-3`}
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
          {!isSidebarCollapsed && (
            <div className='px-2 mb-3'>
              <p className='text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-600'>
                Workspace
              </p>
              <p
                className='mt-1 text-sm font-semibold text-slate-900 dark:text-white truncate'
                title={workspace.name}
              >
                {workspace.name}
              </p>
            </div>
          )}
        </div>

        <SidebarContent
          isSidebarCollapsed={isSidebarCollapsed}
          userRole={userRole}
          activeSection={activeSection}
          onSectionChange={onSectionChange}
          workspace={workspace}
        />
      </aside>

      {isMobileSidebarOpen && (
        <div className='fixed inset-0 z-40 md:hidden'>
          <button
            type='button'
            className='absolute inset-0 bg-black/50 backdrop-blur-sm'
            onClick={() => setIsMobileSidebarOpen(false)}
            aria-label='Close menu'
          />
          <aside className='relative h-full w-72 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex flex-col shadow-2xl'>
            <div className='p-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800'>
              <div className='min-w-0'>
                <p className='text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-600'>
                  Workspace
                </p>
                <p
                  className='mt-1 text-sm font-semibold text-slate-900 dark:text-white truncate'
                  title={workspace.name}
                >
                  {workspace.name}
                </p>
              </div>
              <button
                type='button'
                onClick={() => setIsMobileSidebarOpen(false)}
                className='h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center'
              >
                <X className='w-4 h-4' />
              </button>
            </div>
            <SidebarContent
              isSidebarCollapsed={false}
              userRole={userRole}
              activeSection={activeSection}
              onSectionChange={onSectionChange}
              workspace={workspace}
              closeMobile={() => setIsMobileSidebarOpen(false)}
            />
          </aside>
        </div>
      )}

      <main className='flex-1 overflow-auto bg-app'>
        <header className='h-16 flex items-center justify-between px-4 md:px-8 surface-card sticky top-0 z-10 border-b border-[var(--app-border)]'>
          <div className='flex items-center gap-3'>
            <button
              type='button'
              onClick={() => setIsMobileSidebarOpen(true)}
              className='md:hidden h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center'
              aria-label='Open menu'
            >
              <Menu className='w-4 h-4' />
            </button>
            <div className='text-[var(--app-text-secondary)] text-sm'>
              Workspace /{' '}
              <span className='text-[var(--app-text-primary)] font-medium'>
                {activeSectionLabel}
              </span>
            </div>
          </div>
          <div className='flex items-center gap-4'>
            <span className='px-2.5 py-1 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-bold uppercase tracking-wider hidden md:inline-block'>
              {userRole}
            </span>
          </div>
        </header>
        <div className='p-4 md:p-8'>
          <div className='container mx-auto max-w-7xl'>{children}</div>
        </div>
      </main>
    </div>
  );
}
