import { CheckCircle2 } from 'lucide-react';
import { sectionClass, sectionHeadingClass } from './styles';

const trustItems = [
  'Manual verification by admins',
  'Verified badge shown on listings',
  'Official website ownership reviewed',
];

export default function TrustSummaryCard() {
  return (
    <section className={sectionClass}>
      <h2 className={sectionHeadingClass}>Trust Summary</h2>
      <ul className='mt-4 space-y-2.5'>
        {trustItems.map((item) => (
          <li
            key={item}
            className='flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-300'
          >
            <CheckCircle2 className='mt-0.5 h-4 w-4 shrink-0 text-green-500 dark:text-green-400' />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
