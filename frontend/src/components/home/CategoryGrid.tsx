import Link from 'next/link';
import { Hash } from 'lucide-react';

interface Category {
    id: string;
    name: string;
    slug: string;
}

interface CategoryGridProps {
    categories: Category[];
    currentCountryId?: string;
}

export default function CategoryGrid({ categories, currentCountryId }: CategoryGridProps) {
    return (
        <section className="py-16 px-4 max-w-7xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-12 text-slate-800 dark:text-white">
                Explore by Category
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {categories.map((category) => (
                    <Link
                        key={category.id}
                        href={currentCountryId
                            ? `/search?country=${currentCountryId}&category=${category.id}`
                            : `/search?category=${category.id}`
                        }
                        className="group flex flex-col items-center justify-center p-8 bg-white dark:bg-slate-800 rounded-2xl shadow-sm hover:shadow-xl border border-slate-100 dark:border-slate-700 transition-all duration-300 hover:-translate-y-1"
                    >
                        <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/50 transition-colors">
                            <Hash className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                        </div>
                        <span className="text-lg font-medium text-slate-700 dark:text-slate-200 text-center group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors capitalize">
                            {category.name}
                        </span>
                    </Link>
                ))}
            </div>
        </section>
    );
}
