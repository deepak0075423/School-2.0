import useFetch from '../../hooks/useFetch';
import { getHolidays } from '../../api/parent.api';
import { PageHeader, Table, Badge, Spinner } from '../../components/ui/index';

const TYPE_VARIANT = { public: 'success', school_specific: 'info', optional: 'warning', exam_break: 'danger' };
const TYPE_LABEL   = { public: 'Public', school_specific: 'School', optional: 'Optional', exam_break: 'Exam Break' };

function fmtRange(h) {
  if (!h.startDate) return '—';
  const opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
  const s = new Date(h.startDate).toLocaleDateString('en-IN', opts);
  if (!h.endDate) return s;
  const sIso = new Date(h.startDate).toISOString().slice(0, 10);
  const eIso = new Date(h.endDate).toISOString().slice(0, 10);
  if (sIso === eIso) return s;
  return `${s} – ${new Date(h.endDate).toLocaleDateString('en-IN', opts)}`;
}

function isUpcoming(h) {
  return new Date(h.endDate || h.startDate) >= new Date();
}

export default function ParentHolidays() {
  const { data: holidays, loading } = useFetch(getHolidays);
  const data = holidays || [];

  const columns = [
    { key: 'name',  label: 'Holiday',  render: r => <strong>{r.name}</strong> },
    { key: 'dates', label: 'Date(s)',   render: r => (
        <div>
          <div style={{ fontSize: '.85rem' }}>{fmtRange(r)}</div>
          {r.startDate && r.endDate && new Date(r.startDate).toISOString().slice(0, 10) !== new Date(r.endDate).toISOString().slice(0, 10) && (
            <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
              {Math.round((new Date(r.endDate) - new Date(r.startDate)) / 86400000) + 1} days
            </div>
          )}
        </div>
      )
    },
    { key: 'type',  label: 'Type',     render: r => <Badge variant={TYPE_VARIANT[r.type] || 'info'}>{TYPE_LABEL[r.type] || r.type}</Badge> },
    { key: 'desc',  label: 'Note',     render: r => <span className="text-muted text-sm">{r.description || '—'}</span> },
  ];

  const upcoming = data.filter(isUpcoming).length;

  return (
    <div className="page">
      <PageHeader title="Holidays" subtitle={`${data.length} holidays • ${upcoming} upcoming`} />
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading
            ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={data} emptyIcon="🎉" emptyTitle="No holidays listed" />
          }
        </div>
      </div>
    </div>
  );
}
