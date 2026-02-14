'use client';

import { usePathname } from 'next/navigation';
import Navbar from './Navbar';
import Footer from './Footer';

export default function MainLayoutWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isAdmin = pathname?.startsWith('/admin');

    return (
        <>
            {!isAdmin && <Navbar />}
            <div className={`${isAdmin ? '' : 'pt-16'} min-h-screen flex flex-col`}>
                <main className="flex-grow">
                    {children}
                </main>
                {!isAdmin && <Footer />}
            </div>
        </>
    );
}
