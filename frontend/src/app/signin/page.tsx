import { redirect } from 'next/navigation';

type SignInPageProps = {
    searchParams: Promise<{ next?: string }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
    const params = await searchParams;
    const next = typeof params?.next === 'string' && params.next.startsWith('/')
        ? params.next
        : '/';

    redirect(`/?login=true&returnTo=${encodeURIComponent(next)}`);
}
