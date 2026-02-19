import { Globe, Mail, MapPin, Phone } from 'lucide-react';
import { sectionClass, sectionHeadingClass, subtlePanelClass } from './styles';

interface ContactSectionProps {
  address?: string;
  email?: string;
  phone?: string;
}

export default function ContactSection({
  address,
  email,
  phone,
}: ContactSectionProps) {
  return (
    <section className={sectionClass}>
      <h2 className={`${sectionHeadingClass} flex items-center gap-2.5`}>
        <Globe className='h-5 w-5 text-blue-600 dark:text-blue-400' />
        Contact Information
      </h2>

      <div className='mt-4 grid gap-4 md:grid-cols-2'>
        <div className={subtlePanelClass}>
          <p className='mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400'>
            <MapPin className='h-3.5 w-3.5' />
            Physical Address
          </p>
          <p className='text-sm font-medium text-slate-900 dark:text-white'>
            {address?.trim() || '—'}
          </p>
        </div>

        <div className={subtlePanelClass}>
          <p className='mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400'>
            <Globe className='h-3.5 w-3.5' />
            Digital Contact
          </p>

          <div className='space-y-1.5 text-sm'>
            {email ? (
              <a
                href={`mailto:${email}`}
                className='inline-flex items-center gap-1.5 font-medium text-blue-600 hover:text-blue-500 hover:underline dark:text-blue-300 dark:hover:text-blue-200'
              >
                <Mail className='h-3.5 w-3.5' />
                {email}
              </a>
            ) : (
              <p className='text-slate-700 dark:text-slate-300'>—</p>
            )}

            {phone ? (
              <p className='inline-flex items-center gap-1.5 font-medium text-slate-900 dark:text-white'>
                <Phone className='h-3.5 w-3.5 text-slate-500 dark:text-slate-400' />
                {phone}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
