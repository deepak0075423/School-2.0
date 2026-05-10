import { useState } from 'react';
import useFetch from '../../hooks/useFetch';
import { getHolidays, getClassHolidays } from '../../api/teacher.api';
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

const classColumns = [
  { key: 'name',    label: 'Holiday',   render: r => <strong>{r.name}</strong> },
  { key: 'dates',   label: 'Date(s)',   render: r => (
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
  { key: 'classes', label: 'Classes',   render: r => {
      const names = (r.applicability?.classes || []).map(c => c.className || c.name || '—');
      return names.length ? names.join(', ') : '—';
    }
  },
  { key: 'type',    label: 'Type',      render: r => <Badge variant={TYPE_VARIANT[r.type] || 'info'}>{TYPE_LABEL[r.type] || r.type}</Badge> },
  { key: 'desc',    label: 'Note',      render: r => <span className="text-muted text-sm">{r.description || '—'}</span> },
];

export default function TeacherHolidays() {
  const [tab, setTab] = useState('my');

  const { data: holidays,      loading: l1 } = useFetch(getHolidays);
  const { data: classHolidays, loading: l2 } = useFetch(getClassHolidays);

  const myData    = holidays      || [];
  const classData = classHolidays || [];

  const upcoming      = myData.filter(isUpcoming).length;
  const classUpcoming = classData.filter(isUpcoming).length;

  return (
    <div className="page">
      <PageHeader
        title="Holidays"
        subtitle={tab === 'my'
          ? `${myData.length} holidays · ${upcoming} upcoming`
          : `${classData.length} class holidays · ${classUpcoming} upcoming`
        }
      />

      <div className="tabs" style={{ marginBottom: '1rem' }}>
        <button className={`tab${tab === 'my' ? ' active' : ''}`} onClick={() => setTab('my')}>
          My Holidays
        </button>
        <button className={`tab${tab === 'class' ? ' active' : ''}`} onClick={() => setTab('class')}>
          My Class Holidays
          {classData.length > 0 && (
            <span style={{ marginLeft: 6, background: 'var(--primary)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: '.7rem' }}>
              {classData.length}
            </span>
          )}
        </button>
      </div>

      {tab === 'my' && (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {l1
              ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
              : <Table columns={columns} data={myData} emptyIcon="🎉" emptyTitle="No holidays listed" />
            }
          </div>
        </div>
      )}

      {tab === 'class' && (
        <div className="card">
          <div className="card-header" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle, #f8f9fa)' }}>
            <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
              Holidays for classes where you are class teacher, substitute teacher, or subject teacher — for schedule awareness only.
            </span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {l2
              ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
              : <Table columns={classColumns} data={classData} emptyIcon="🏫" emptyTitle="No class-specific holidays for your classes" />
            }
          </div>
        </div>
      )}
    </div>
  );
}
