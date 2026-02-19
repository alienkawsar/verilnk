import { Building2 } from 'lucide-react';
import { sectionClass, sectionHeadingClass } from './styles';

interface AboutSectionProps {
  about?: string;
}

export default function AboutSection({ about }: AboutSectionProps) {
  return (
    <section className={sectionClass}>
      <h2 className={`${sectionHeadingClass} flex items-center gap-2.5`}>
        <Building2 className='h-5 w-5 text-blue-600 dark:text-blue-400' />
        About Organization
      </h2>
      <p className='mt-4 whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-300 sm:text-[15px]'>
        {about?.trim() || '—'}
      </p>
    </section>
  );
}
