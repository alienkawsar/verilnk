import { type Metadata } from 'next';
import { Suspense } from 'react';
import { fetchCountries, fetchCategories } from '@/lib/api';
import HomeClient from './HomeClient';

type Props = {
  searchParams: { [key: string]: string | string[] | undefined }
}

export async function generateMetadata(
  { searchParams }: Props,
): Promise<Metadata> {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.NODE_ENV === 'production' ? 'https://verilnk.com' : 'http://localhost:3000');

  const params: any = await searchParams; // Next.js 15+ await searchParams
  const countryId = params?.countryId;
  const categoryId = params?.categoryId;

  let title = "VeriLnk — Official Website Verification Platform";
  let description = "Verify official government, healthcare, education and essential websites securely. Find trusted digital resources.";

  if (countryId || categoryId) {
    try {
      const [countries, categories] = await Promise.all([
        fetchCountries(),
        fetchCategories()
      ]);

      const country = countries.find((c: any) => c.id === countryId)?.name;
      const category = categories.find((c: any) => c.id === categoryId)?.name;

      if (country && category) {
        title = `Official ${category} Sites in ${country} | VeriLnk`;
        description = `Access verified ${category} websites for ${country}. Secure, official, and trusted sources.`;
      } else if (country) {
        title = `Official Government & Trusted Sites in ${country} | VeriLnk`;
        description = `Browse the official directory of verified websites for ${country}. Government, Education, and more.`;
      } else if (category) {
        title = `Verified ${category} Websites - Global Directory | VeriLnk`;
        description = `Find trusted ${category} sites worldwide. Verified for authenticity and security.`;
      }
    } catch (e) {
      console.error("SEO Metadata fetch failed", e);
    }
  }

  return {
    title,
    description,
    alternates: {
      canonical: '/',
    },
    openGraph: {
      title,
      description,
      type: 'website',
    },
    twitter: {
      title,
      description
    }
  };
}

export default async function Home() {
  // Fetch initial data in parallel
  const [countries, categories] = await Promise.all([
    fetchCountries().catch((e) => { console.error("Country fetch failed:", e); return []; }),
    fetchCategories().catch((e) => { console.error("Category fetch failed:", e); return []; })
  ]);

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.NODE_ENV === 'production' ? 'https://verilnk.com' : 'http://localhost:3000');

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "VeriLnk",
    "url": siteUrl,
    "potentialAction": {
      "@type": "SearchAction",
      "target": `${siteUrl}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string"
    }
  });

  return (
    <>
      <Suspense fallback={<div className="min-h-screen" />}>
        <HomeClient initialCountries={countries} initialCategories={categories} />
      </Suspense>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
    </>
  );
}
