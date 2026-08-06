interface Props {
  status: string;
}

const styles: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  accepted: 'bg-emerald-100 text-emerald-700',
  declined: 'bg-red-100 text-red-700',
  available: 'bg-emerald-100 text-emerald-700',
  unavailable: 'bg-slate-100 text-slate-600',
  verified: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
};

export default function StatusBadge({ status }: Props) {
  return <span className={`badge capitalize ${styles[status] || 'bg-slate-100 text-slate-600'}`}>{status}</span>;
}
