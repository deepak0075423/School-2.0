import React from 'react';
import useFetch from '../../../hooks/useFetch';
import { getMyFines } from '../../../api/library.api';
import { PageHeader, Table, Badge, Spinner } from '../../../components/ui/index';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';

export default function LibraryMyFines() {
  const { data, loading } = useFetch(getMyFines);
  const fines = Array.isArray(data) ? data : [];

  const pending = fines.filter(f => f.status === 'pending');
  const totalDue = pending.reduce((s, f) => s + (f.amount || 0), 0);

  const statusColor = { pending: 'warning', paid: 'success', waived: 'muted' };

  const columns = [
    { key: 'issued',  label: 'Issued',   render: r => fmtDate(r.issuance?.issueDate) },
    { key: 'due',     label: 'Was Due',  render: r => fmtDate(r.issuance?.dueDate) },
    { key: 'returned',label: 'Returned', render: r => fmtDate(r.issuance?.returnDate) },
    { key: 'days',    label: 'Days Late',render: r => r.daysLate ?? '—' },
    { key: 'amount',  label: 'Amount',   render: r => <strong>₹{(r.amount||0).toLocaleString()}</strong> },
    { key: 'status',  label: 'Status',   render: r => <Badge variant={statusColor[r.status]||'muted'}>{r.status}</Badge> },
  ];

  return (
    <div className="page">
      <PageHeader title="My Library Fines" subtitle="Overdue fines" />
      {totalDue > 0 && (
        <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:'var(--radius)', padding:'12px 16px', marginBottom:16 }}>
          <strong style={{ color:'#991b1b' }}>Total Due: ₹{totalDue.toLocaleString()}</strong>
          <span style={{ color:'#991b1b', marginLeft:8, fontSize:'.85rem' }}>Please pay at the library counter.</span>
        </div>
      )}
      <div className="card">
        <div className="card-body" style={{ padding:0 }}>
          {loading ? <div style={{ padding:48, display:'flex', justifyContent:'center' }}><Spinner /></div>
            : <Table columns={columns} data={fines} emptyIcon="✅" emptyTitle="No fines!" />}
        </div>
      </div>
    </div>
  );
}
