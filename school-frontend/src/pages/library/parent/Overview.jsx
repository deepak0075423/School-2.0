import React from 'react';
import useFetch from '../../../hooks/useFetch';
import { getParentOverview } from '../../../api/library.api';
import { PageHeader, Table, Badge, Spinner } from '../../../components/ui/index';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';

export default function LibraryParentOverview() {
  const { data, loading } = useFetch(getParentOverview);
  const children = data?.children || [];

  const now = new Date();
  const issuanceColor = (r) => {
    if (r.status === 'returned') return 'muted';
    if (r.isOverdue || (r.status === 'issued' && now > new Date(r.dueDate))) return 'danger';
    return 'success';
  };
  const issuanceLabel = (r) => {
    if (r.status === 'returned') return 'Returned';
    if (r.isOverdue || (r.status === 'issued' && now > new Date(r.dueDate))) return 'Overdue';
    return 'Issued';
  };

  const fineColor = { pending: 'warning', paid: 'success', waived: 'muted' };

  const bookColumns = [
    { key: 'book',    label: 'Book',     render: r => <div><div style={{ fontWeight:600 }}>{r.book?.title||'—'}</div><div style={{ fontSize:'.75rem',color:'var(--text-muted)' }}>{(r.book?.authors||[]).join(', ')}</div></div> },
    { key: 'issued',  label: 'Issued',   render: r => fmtDate(r.issueDate) },
    { key: 'due',     label: 'Due Date', render: r => {
      const overdue = r.status === 'issued' && now > new Date(r.dueDate);
      return <span style={{ color: overdue ? 'var(--danger)' : 'inherit', fontWeight: overdue ? 600 : 400 }}>{fmtDate(r.dueDate)}</span>;
    }},
    { key: 'status',  label: 'Status',   render: r => <Badge variant={issuanceColor(r)}>{issuanceLabel(r)}</Badge> },
  ];

  const fineColumns = [
    { key: 'book',   label: 'Book',      render: r => r.issuance?.book?.title || '—' },
    { key: 'days',   label: 'Days Late', render: r => r.daysLate ?? '—' },
    { key: 'amount', label: 'Amount',    render: r => <strong>₹{(r.amount||0).toLocaleString()}</strong> },
    { key: 'status', label: 'Status',    render: r => <Badge variant={fineColor[r.status]||'muted'}>{r.status}</Badge> },
  ];

  return (
    <div className="page">
      <PageHeader title="Library Overview" subtitle="Child's library activity" />
      {loading ? (
        <div style={{ padding:48, display:'flex', justifyContent:'center' }}><Spinner /></div>
      ) : children.length === 0 ? (
        <div className="card"><div className="card-body" style={{ textAlign:'center', color:'var(--text-muted)', padding:48 }}>No library data available</div></div>
      ) : children.map((child) => {
        const pendingFines = (child.fines||[]).filter(f => f.status === 'pending');
        const totalDue = pendingFines.reduce((s, f) => s + (f.amount||0), 0);
        return (
          <div key={child.childId?._id || child.childId} style={{ marginBottom:32 }}>
            <h3 style={{ marginBottom:12 }}>{child.childId?.name || 'Child'}</h3>
            {totalDue > 0 && (
              <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:'var(--radius)', padding:'12px 16px', marginBottom:12 }}>
                <strong style={{ color:'#991b1b' }}>Outstanding Fines: ₹{totalDue.toLocaleString()}</strong>
                <span style={{ color:'#991b1b', marginLeft:8, fontSize:'.85rem' }}>Please pay at the library counter.</span>
              </div>
            )}
            <div style={{ marginBottom:16 }}>
              <h4 style={{ marginBottom:8, fontSize:'.95rem', color:'var(--text-muted)' }}>Books Borrowed</h4>
              <div className="card">
                <div className="card-body" style={{ padding:0 }}>
                  <Table columns={bookColumns} data={child.issuances||[]} emptyIcon="📚" emptyTitle="No books borrowed" />
                </div>
              </div>
            </div>
            <div>
              <h4 style={{ marginBottom:8, fontSize:'.95rem', color:'var(--text-muted)' }}>Fines</h4>
              <div className="card">
                <div className="card-body" style={{ padding:0 }}>
                  <Table columns={fineColumns} data={child.fines||[]} emptyIcon="✅" emptyTitle="No fines" />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
