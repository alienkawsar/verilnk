import {
  detailLabelClass,
  detailRowClass,
  detailValueClass,
  sectionClass,
  sectionHeadingClass,
} from './styles';
import { getDisplayDomain, type OrgPublicProfile } from './types';

interface OrgDetailsCardProps {
  org: OrgPublicProfile;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={detailRowClass}>
      <span className={detailLabelClass}>{label}</span>
      <span className={detailValueClass}>{value || '—'}</span>
    </div>
  );
}

export default function OrgDetailsCard({ org }: OrgDetailsCardProps) {
  return (
    <section className={sectionClass}>
      <h2 className={sectionHeadingClass}>Organization Details</h2>
      <div className='mt-4 divide-y divide-slate-200/70 dark:divide-white/10'>
        <DetailRow label='Country' value={org.country?.name || '—'} />
        <DetailRow label='Category' value={org.category?.name || '—'} />
        <DetailRow label='Type' value={org.type || '—'} />
        <DetailRow label='Website' value={getDisplayDomain(org.website)} />
      </div>
    </section>
  );
}
