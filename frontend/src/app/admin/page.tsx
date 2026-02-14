import { redirect } from 'next/navigation';

export default function AdminPage() {
    // Middleware handles auth check, so if we are here, we are authenticated (or middleware failed).
    // We simply redirect to the main dashboard view.
    redirect('/admin/dashboard');
}
