import { redirect } from 'next/navigation';

type SignInPageProps = {
    searchParams: Promise<{ next?: string; force?: string }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
    const params = await searchParams;
    const next = typeof params?.next === 'string' && params.next.startsWith('/')
        ? params.next
        : '/';
    const force = params?.force === 'true';

    const query = new URLSearchParams({
        login: 'true',
        returnTo: next
    });
    if (force) {
        query.set('forceLogin', 'true');
    }

    redirect(`/?${query.toString()}`);
}
