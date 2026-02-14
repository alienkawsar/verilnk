import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    localPatterns: [
      {
        pathname: '/uploads/**',
      },
      {
        pathname: '/api/media/**',
      },
      {
        pathname: '/VERILNK_*.png',
      },
      {
        pathname: '/favicon.ico',
      },
    ],
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '8000',
        pathname: '/uploads/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '8000',
        pathname: '/uploads/flags/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '8000',
        pathname: '/uploads/org-logos/**',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '8000',
        pathname: '/uploads/**',
      },
      {
        protocol: 'https',
        hostname: '**', // Allow external URLs for admin-pasted logos
      }
    ],
  },
  async headers() {
    const isProd = process.env.NODE_ENV === 'production';

    // Build CSP directives based on environment
    const imgSrc = isProd
      ? "img-src 'self' https: data: blob:"
      : "img-src 'self' https: http://localhost:* data: blob:";

    const cspDirectives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com https://www.gstatic.com https://www.recaptcha.net",
      "style-src 'self' 'unsafe-inline' https:",
      imgSrc,
      "font-src 'self' https: data:",
      "connect-src 'self' https: http://localhost:* ws: wss:",
      "media-src 'self' blob:",
      "worker-src 'self' blob:",
      "frame-src https://www.google.com https://www.gstatic.com https://www.recaptcha.net",
      "frame-ancestors 'none'"
    ].join('; ');

    const securityHeaders = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(self), payment=(), usb=()' },
      {
        key: 'Content-Security-Policy-Report-Only',
        value: cspDirectives
      }
    ];

    // Only add COEP in production (it blocks cross-origin resources in dev)
    if (isProd) {
      securityHeaders.push({
        key: 'Cross-Origin-Embedder-Policy',
        value: 'require-corp'
      });
      securityHeaders.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=15552000; includeSubDomains; preload'
      });
    }

    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

