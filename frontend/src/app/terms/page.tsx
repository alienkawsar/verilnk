
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Terms of Service',
    description: 'Terms and Conditions for using the VeriLnk platform.',
    alternates: {
        canonical: '/terms',
    },
    openGraph: {
        title: 'Terms of Service | VeriLnk',
        description: 'Terms and Conditions for using the VeriLnk platform.',
        type: 'website',
    },
    twitter: {
        title: 'Terms of Service | VeriLnk',
        description: 'Terms and Conditions for using the VeriLnk platform.',
    }
};

export default function TermsPage() {
    return (
        <div className="min-h-screen text-slate-700 dark:text-slate-300 py-24 px-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-8 border-b border-slate-200 dark:border-slate-800 pb-6">
                    Terms of Service
                </h1>

                <div className="space-y-8 leading-relaxed">
                    <section>
                        <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">1. Agreement to Terms</h2>
                        <p>
                            By accessing or using the VeriLnk website, you agree to be bound by these Terms of Service and all applicable laws and regulations.
                            If you do not agree with any of these terms, you are prohibited from using or accessing this site.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">2. Use License</h2>
                        <p>
                            Permission is granted to access and view the materials (information or software) on VeriLnk's website for personal, non-commercial transitory viewing only.
                            This is the grant of a license, not a transfer of title, and under this license you may not:
                        </p>
                        <ul className="list-disc pl-5 mt-4 space-y-2 marker:text-blue-500">
                            <li>modify or copy the materials;</li>
                            <li>use the materials for any commercial purpose, or for any public display (commercial or non-commercial);</li>
                            <li>attempt to decompile or reverse engineer any software contained on VeriLnk's website;</li>
                            <li>remove any copyright or other proprietary notations from the materials;</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">3. Verification Accuracy</h2>
                        <p>
                            The materials appearing on VeriLnk's website could include technical, typographical, or photographic errors.
                            VeriLnk does not warrant that any of the materials on its website are accurate, complete, or current.
                            While we strive for 100% accuracy in our verification process, users should always exercise due diligence.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">4. User Accounts</h2>
                        <p>
                            When you create an account with us, you must provide us information that is accurate, complete, and current at all times.
                            Failure to do so constitutes a breach of the Terms, which may result in immediate termination of your account on our Service.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">5. Disclaimer</h2>
                        <p className="italic text-slate-600 dark:text-slate-400 border-l-4 border-slate-300 dark:border-slate-700 pl-4 py-2 my-4 bg-white dark:bg-slate-900/50">
                            The services are provided "as is". VeriLnk makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties,
                            including without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">6. Governing Law</h2>
                        <p>
                            These terms and conditions are governed by and construed in accordance with the laws of Bangladesh and you irrevocably submit to the exclusive jurisdiction of the courts in that location.
                        </p>
                    </section>

                    <div className="pt-8 text-sm text-slate-500 border-t border-slate-200 dark:border-slate-800">
                        Last updated: December 2025
                    </div>
                </div>
            </div>
        </div>
    );
}
