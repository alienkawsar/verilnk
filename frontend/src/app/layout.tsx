import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.NODE_ENV === 'production' ? 'https://verilnk.com' : 'http://localhost:3000');

export const metadata: Metadata = {
  title: {
    default: "VeriLnk — Official Website Verification Platform",
    template: "%s | VeriLnk"
  },
  description: "The global trust standard for verifying official government, education, and healthcare websites. Protect yourself from phishing and scams.",
  metadataBase: new URL(siteUrl),
  applicationName: 'VeriLnk',
  authors: [{ name: 'VeriLnk Team', url: siteUrl }],
  generator: 'Next.js',
  keywords: ['verification', 'official websites', 'anti-phishing', 'government sites', 'education sites', 'healthcare verification', 'trusted links', 'global directory'],
  referrer: 'origin-when-cross-origin',
  creator: 'VeriLnk',
  publisher: 'VeriLnk',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: 'VeriLnk',
    title: 'VeriLnk — Official Website Verification Platform',
    description: 'Verify official sources instantly. Access the global directory of authenticated government and education domains.',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'VeriLnk — Official Website Verification Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VeriLnk — Official Website Verification Platform',
    description: 'Detect trusted websites instantly. The #1 global verification platform.',
    images: ['/og-image.jpg'],
    creator: '@verilnk',
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  verification: {
    google: 'verification-code-if-any',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};


import { NextAuthProvider } from "@/components/auth/NextAuthProvider";
import RecaptchaProvider from "@/components/auth/RecaptchaProvider";
import { CountryProvider } from "@/context/CountryContext";
import { AuthProvider } from "@/context/AuthContext";
import { ToastProvider } from "@/components/ui/Toast";
import { ThemeProvider } from "@/context/ThemeContext";
import MainLayoutWrapper from "@/components/layout/MainLayoutWrapper";
import SessionMonitor from "@/components/auth/SessionMonitor";
import ConnectivityProvider from "@/components/system/ConnectivityProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <NextAuthProvider>
          <RecaptchaProvider>
            <AuthProvider>
              <CountryProvider>
                <ToastProvider>
                  <ThemeProvider>
                    <ConnectivityProvider>
                      <MainLayoutWrapper>
                        {children}
                      </MainLayoutWrapper>
                      <SessionMonitor />
                    </ConnectivityProvider>
                  </ThemeProvider>
                </ToastProvider>
              </CountryProvider>
            </AuthProvider>
          </RecaptchaProvider>
        </NextAuthProvider>
      </body>
    </html>
  );
}
