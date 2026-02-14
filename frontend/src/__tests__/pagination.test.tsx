import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Pagination from '@/components/common/Pagination';

const push = vi.fn();

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push }),
    useSearchParams: () => new URLSearchParams('page=2'),
}));

describe('Pagination', () => {
    it('renders current page indicator on mobile layout', () => {
        render(<Pagination total={60} limit={15} />);
        expect(screen.getByText('Page 2 / 4')).toBeInTheDocument();
    });
});
