'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Github, Linkedin, Twitter, Globe, Mail, Heart } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const { resolvedTheme } = useTheme();

  return (
    <footer className='bg-app-secondary text-[var(--app-text-secondary)] border-t border-[var(--app-border)]'>
      <div className='container mx-auto px-6 py-12 md:py-16'>
        <div className='flex flex-col items-center text-center mb-12'>
          {/* Centered Logo */}
          <Link
            href='/'
            className='h-8 w-32 md:h-12 md:w-48 relative mb-2 block transition-transform hover:scale-105'
          >
            {
              // If resolvedTheme is not ready, we might default to one, but client component should have it.
              // Assuming VERILNK_DARK is white text (for dark bg) and LIGHT is dark text (for light bg).
            }
            <Image
              src={
                resolvedTheme === 'dark'
                  ? '/VERILNK_DARK.png'
                  : '/VERILNK_LIGHT.png'
              }
              alt='VeriLnk'
              fill
              sizes="(min-width: 768px) 192px, 128px"
              className='object-contain'
            />
          </Link>
          {/* Slogan */}
          <p className='text-sm leading-relaxed text-slate-600 dark:text-slate-500 max-w-2xl'>
            A global platform for verifying government, education, healthcare,
            utility, e-commerce, and other essential websites—built to safeguard
            users from online fraud.
          </p>
        </div>

        {/* Links and Socials Row */}
        <div className='flex flex-col md:flex-row justify-between items-center gap-6 w-full pb-8 border-b border-slate-200 dark:border-slate-900 border-none'>
          {/* Left: Links */}
          <div className='flex flex-wrap justify-center md:justify-start gap-6'>
            <Link
              href='/about'
              className='text-sm hover:text-blue-400 transition-colors duration-200'
            >
              About Us
            </Link>
            <Link
              href='/privacy'
              className='text-sm hover:text-blue-400 transition-colors duration-200'
            >
              Privacy Policy
            </Link>
            <Link
              href='/contact'
              className='text-sm hover:text-blue-400 transition-colors duration-200'
            >
              Contact Support
            </Link>
            <Link
              href='/terms'
              className='text-sm hover:text-blue-400 transition-colors duration-200'
            >
              Terms of Service
            </Link>
            <Link
              href='/verification-process'
              className='text-sm hover:text-blue-400 transition-colors duration-200'
            >
              Verification Process
            </Link>
            <Link
              href='/pricing'
              className='text-sm hover:text-blue-400 transition-colors duration-200'
            >
              Pricing
            </Link>
            <Link
              href='/api-docs'
              className='text-sm hover:text-blue-400 transition-colors duration-200'
            >
              API Docs
            </Link>
          </div>

          {/* Right: Socials */}
          <div className='flex gap-4'>
            <a
              href='#'
              aria-label='Follow us on Twitter'
              className='text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors duration-200'
            >
              <span className='sr-only'>Twitter</span>
              <Twitter className='w-5 h-5' />
            </a>
            <a
              href='#'
              aria-label='Visit our GitHub'
              className='text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors duration-200'
            >
              <span className='sr-only'>GitHub</span>
              <Github className='w-5 h-5' />
            </a>
            <a
              href='#'
              aria-label='Connect on LinkedIn'
              className='text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors duration-200'
            >
              <span className='sr-only'>LinkedIn</span>
              <Linkedin className='w-5 h-5' />
            </a>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className='pt-3 mt-3 border-t border-slate-200 dark:border-slate-900 flex flex-col md:flex-row justify-center items-center gap-2'>
          <p className='text-xs text-slate-500 dark:text-slate-600 order-2 md:order-1'>
            &copy; {currentYear} VeriLnk. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
