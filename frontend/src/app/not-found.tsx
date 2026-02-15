import Link from 'next/link';
import { Home, Globe, LayoutGrid } from 'lucide-react';
import SearchComponent from '@/components/common/SearchComponent';
import NotFoundThemeImage from '@/components/shared/NotFoundThemeImage';

export default function NotFound() {
    return (
        <div className="min-h-[80vh] flex flex-col items-center justify-center p-4 text-center">
            {/* Animated Graphic */}
            <div className="mb-8 flex justify-center">
                <NotFoundThemeImage
                    alt="Page not found"
                    className="h-32 w-32 sm:h-40 sm:w-40 md:h-44 md:w-44 object-contain animate-float motion-reduce:animate-none"
                />
            </div>

            {/* Typography */}
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-4 tracking-tight">
                Oops! Page Not Found
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400 max-w-lg mb-10">
                The page you are looking for doesn&apos;t exist or the link may be broken.
                Try searching for an official site below.
            </p>

            {/* Actions Container */}
            <div className="w-full max-w-2xl space-y-10">
                {/* Search Bar */}
                <div className="transform hover:scale-[1.01] transition-transform duration-300">
                    <SearchComponent />
                </div>

                {/* Quick Links */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <Link
                        href="/"
                        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-600/40 active:scale-95"
                    >
                        <Home className="w-4 h-4" />
                        Go to Homepage
                    </Link>

                    <Link
                        href="/search"
                        className="flex items-center gap-2 px-6 py-3 rounded-xl surface-card hover:border-blue-500 transition-all hover:shadow-md active:scale-95"
                    >
                        <Globe className="w-4 h-4 text-blue-500" />
                        Explore by Country
                    </Link>

                    <Link
                        href="/search"
                        className="flex items-center gap-2 px-6 py-3 rounded-xl surface-card hover:border-blue-500 transition-all hover:shadow-md active:scale-95"
                    >
                        <LayoutGrid className="w-4 h-4 text-purple-500" />
                        Browse Categories
                    </Link>
                </div>
            </div>
        </div>
    );
}
