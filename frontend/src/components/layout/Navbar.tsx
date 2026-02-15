'use client';

import { useState, useEffect, useRef, Suspense } from 'react';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ShieldCheck, Globe } from 'lucide-react';
import { useCountry } from '@/context/CountryContext';
import { getInitials, getFlagEmoji } from '@/lib/utils';

import LoginModal from '@/components/auth/LoginModal';
import SignupModal from '@/components/auth/SignupModal';
import { useAuth } from '@/context/AuthContext';
import { LogIn, User as UserIcon, LogOut, Menu } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton'; // Added Skeleton import

import { useTheme } from '@/context/ThemeContext';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

function NavbarContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    countryName,
    countryCode,
    stateCode,
    stateName,
    flagImage,
    isResolved,
  } = useCountry();
  const { user, logout } = useAuth();
  const { resolvedTheme } = useTheme();
  const [imgError, setImgError] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isSignupOpen, setIsSignupOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setImgError(false);
  }, [flagImage]);

  // Open Login Modal if ?login=true is present
  useEffect(() => {
    if (searchParams?.get('login') === 'true') {
      setIsLoginOpen(true);
    }
  }, [searchParams]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };

    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen]);

  useEffect(() => {
    if (!mobileMenuOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (
        mobileMenuRef.current &&
        !mobileMenuRef.current.contains(event.target as Node)
      ) {
        setMobileMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [mobileMenuOpen]);

  // Hide Navbar on admin pages
  if (pathname?.startsWith('/admin')) {
    return null;
  }

  const openLogin = () => {
    setIsLoginOpen(true);
    setIsSignupOpen(false);
  };

  const openSignup = () => {
    setIsSignupOpen(true);
    setIsLoginOpen(false);
  };

  return (
    <>
      <nav className='fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-700 transition-colors duration-300'>
        <div className='w-full px-4 h-16 flex items-center justify-between relative'>
          {/* Left Side: Country */}
          <div className='flex-1 flex justify-start relative z-20'>
            <div
              className='flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50/50 dark:bg-white/5 backdrop-blur-md border border-slate-200/50 dark:border-white/10 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-100/50 dark:hover:bg-white/10 transition-all shadow-sm cursor-help h-9'
              title={countryName}
            >
              {!isResolved ? (
                <>
                  <Skeleton className='w-5 h-5 rounded-full' />
                  <Skeleton className='h-2.5 w-10 rounded-full' />
                </>
              ) : flagImage && !imgError ? (
                <div className='relative w-5 h-5 rounded-full overflow-hidden border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-slate-700 shrink-0 shadow-sm'>
                  <Image
                    src={flagImage}
                    alt={countryName}
                    fill
                    sizes="20px"
                    className='object-cover'
                    onError={() => setImgError(true)}
                  />
                </div>
              ) : countryCode === 'Global' ? (
                <div className='p-0.5 bg-blue-500/10 rounded-full'>
                  <Globe className='w-4 h-4 text-blue-500 dark:text-blue-400 shrink-0' />
                </div>
              ) : null}
              {isResolved && (
                <span className='relative pr-3'>
                  <span className='font-medium text-xs tracking-tight'>
                    {countryCode === 'Global'
                      ? 'Global'
                      : countryCode?.toUpperCase()}
                  </span>
                  {countryCode !== 'Global' &&
                    (stateCode || stateName) && (
                      <span className='absolute -top-0.5 -right-0.5 text-[8px] font-medium text-slate-400 dark:text-slate-500 leading-none'>
                        {(stateCode || stateName)?.toUpperCase()}
                      </span>
                    )}
                </span>
              )}
            </div>
          </div>

          {/* Center: Logo */}
          <div className='absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30'>
            <Link href='/' className='flex items-center gap-2 group'>
              <div className='h-8 w-32 md:h-10 md:w-40 relative'>
                <Image
                  src={
                    resolvedTheme === 'dark'
                      ? '/VERILNK_DARK.png'
                      : '/VERILNK_LIGHT.png'
                  }
                  alt='VeriLnk'
                  fill
                  sizes="(min-width: 768px) 160px, 128px"
                  className='object-contain'
                  priority
                />
              </div>
            </Link>
          </div>

          {/* Right Side: Auth */}
          <div className='flex-1 flex justify-end items-center gap-4 relative z-20'>
            {user ? (
              <>
                <ThemeToggle />
                <div className='relative' ref={dropdownRef}>
                  <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className='focus:outline-none transition-transform hover:scale-105'
                    title={
                      user.firstName
                        ? `${user.firstName} ${user.lastName}`
                        : user.name
                    }
                  >
                    <div
                      className='w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-sm font-bold text-white border-2 border-slate-200 dark:border-slate-700 shadow-md ring-2 ring-transparent bg-cover bg-center'
                      style={
                        user.profileImage
                          ? { backgroundImage: `url(${user.profileImage})` }
                          : {}
                      }
                    >
                      {!user.profileImage &&
                        getInitials(
                          user.firstName,
                          user.lastName,
                          user.name,
                          user.email,
                        )}
                    </div>
                  </button>

                  {/* Dropdown Menu */}
                  {dropdownOpen && (
                    <>
                      <div className='absolute top-full right-0 mt-3 w-56 surface-card rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100 origin-top-right ring-1 ring-black/5'>
                        <div className='p-4 border-b border-slate-200 dark:border-white/10'>
                          <p className='text-xs font-semibold text-slate-500 dark:text-blue-200/70 uppercase tracking-wider mb-1'>
                            Signed in as
                          </p>
                          <p className='text-sm font-bold text-slate-900 dark:text-[#EAF0FF] truncate'>
                            {user.firstName
                              ? `${user.firstName} ${user.lastName}`
                              : user.name}
                          </p>
                          <p className='text-xs text-slate-500 dark:text-blue-200/70 truncate'>
                            {user.email}
                          </p>
                        </div>

                        <div className='p-1'>
                          <Link
                            href={
                              user.organizationId && user.planType === 'ENTERPRISE'
                                ? '/enterprise'
                                : user.organizationId
                                  ? '/org/dashboard'
                                  : '/dashboard'
                            }
                            onClick={() => setDropdownOpen(false)}
                            className='flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white rounded-lg transition-colors'
                          >
                            <div className='w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400'>
                              <UserIcon className='w-4 h-4' />
                            </div>
                            Dashboard
                          </Link>

                          <button
                            onClick={() => {
                              logout();
                              setDropdownOpen(false);
                            }}
                            className='w-full text-left px-3 py-2 text-sm text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-300 rounded-lg transition-colors flex items-center gap-2'
                          >
                            <div className='w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500 dark:text-red-400'>
                              <LogOut className='w-4 h-4' />
                            </div>
                            Sign Out
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className='hidden sm:flex items-center gap-4'>
                  <ThemeToggle />

                  <button
                    onClick={openLogin}
                    className='h-10 px-6 rounded-full bg-black/5 dark:bg-white/10 backdrop-blur-md border border-black/10 dark:border-white/10 text-slate-700 dark:text-white text-sm font-medium transition-all shadow-sm hover:shadow-md hover:bg-black/10 dark:hover:bg-white/20 active:translate-y-0.5 focus-visible:ring-2 focus-visible:ring-slate-400 flex items-center gap-2 group'
                  >
                    <LogIn className='w-3.5 h-3.5 opacity-70 group-hover:opacity-100 transition-opacity' />
                    <span className='hidden sm:inline'>Sign In</span>
                  </button>
                </div>

                <div className='sm:hidden relative' ref={mobileMenuRef}>
                  <button
                    onClick={() => setMobileMenuOpen((prev) => !prev)}
                    aria-label='Open menu'
                    aria-expanded={mobileMenuOpen}
                    aria-haspopup='menu'
                    className='w-9 h-9 rounded-full flex items-center justify-center bg-slate-100/90 dark:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-100 shadow-sm transition-colors hover:bg-slate-200 dark:hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500/50'
                  >
                    <Menu className='w-4 h-4' />
                  </button>

                  {mobileMenuOpen && (
                    <div className='absolute top-full right-0 mt-2 w-60 p-3 space-y-2 rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/90 dark:bg-[#101627]/90 backdrop-blur-xl shadow-xl z-50'>
                      <div className='flex items-center justify-between'>
                        <span className='text-sm font-medium text-slate-700 dark:text-slate-200'>
                          Theme
                        </span>
                        <ThemeToggle onToggle={() => setMobileMenuOpen(false)} />
                      </div>

                      <div className='h-px bg-slate-200 dark:bg-white/10' />

                      <button
                        onClick={() => {
                          setMobileMenuOpen(false);
                          openLogin();
                        }}
                        className='w-full h-10 rounded-lg bg-[#187DE9] text-white text-sm font-semibold tracking-wide hover:bg-[#176FCE] transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50'
                      >
                        SIGN IN
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </nav>

      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onSwitchToSignup={openSignup}
      />
      <SignupModal
        isOpen={isSignupOpen}
        onClose={() => setIsSignupOpen(false)}
        onSwitchToLogin={openLogin}
      />
    </>
  );
}

export default function Navbar() {
  return (
    <Suspense fallback={<nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/80 h-16" />}>
      <NavbarContent />
    </Suspense>
  );
}
