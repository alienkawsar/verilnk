import type { Metadata } from 'next';
import ContactClient from './ContactClient';

export const metadata: Metadata = {
    title: 'Contact Support',
    description: 'Contact VeriLnk support for help, feedback, or to report issues.',
    alternates: {
        canonical: '/contact',
    },
    openGraph: {
        title: 'Contact Support | VeriLnk',
        description: 'Contact VeriLnk support for help, feedback, or to report issues.',
        type: 'website'
    },
    twitter: {
        title: 'Contact Support | VeriLnk',
        description: 'Contact VeriLnk support for help, feedback, or to report issues.'
    }
};

export default function ContactPage() {
    return <ContactClient />;
}
