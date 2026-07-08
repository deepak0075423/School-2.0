import React from 'react';
import useFetch from '../../../hooks/useFetch';
import { getMyBooks } from '../../../api/library.api';
import { PageHeader, Table, Badge, Spinner } from '../../../components/ui/index';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';

export default function LibraryMyBooks() {
  const { data, loading } = useFetch(getMyBooks);
  const books = Array.isArray(data) ? data : [];

  const now = new Date();
  const statusColor = (r) => {
    if (r.status === 'returned') return 'muted';
    if (r.isOverdue || (r.status === 'issued' && now > new Date(r.dueDate))) return 'danger';
    return 'success';
  };
  const statusLabel = (r) => {
    if (r.status === 'returned') return 'Returned';
    if (r.isOverdue || (r.status === 'issued' && now > new Date(r.dueDate))) return 'Overdue';
    return 'Issued';
  };

  const columns = [
    { key: 'book',     label: 'Book',     render: r => <div><div style={{ fontWeight:600 }}>{r.book?.title||'—'}</div><div style={{ fontSize:'.75rem',color:'var(--text-muted)' }}>{(r.book?.authors||[]).join(', ')}</div></div> },
    { key: 'isbn',     label: 'ISBN',     render: r => r.book?.isbn || '—' },
    { key: 'copy',     label: 'Copy',     render: r => r.bookCopy?.uniqueCode || '—' },
    { key: 'issued',   label: 'Issued',   render: r => fmtDate(r.issueDate) },
    { key: 'due',      label: 'Due Date', render: r => {
      const overdue = r.status === 'issued' && now > new Date(r.dueDate);
      return <span style={{ color: overdue ? 'var(--danger)' : 'inherit', fontWeight: overdue ? 600 : 400 }}>{fmtDate(r.dueDate)}</span>;
    }},
    { key: 'status',   label: 'Status',   render: r => <Badge variant={statusColor(r)}>{statusLabel(r)}</Badge> },
    { key: 'renewals', label: 'Renewals', render: r => r.renewalCount ?? 0 },
  ];

  return (
    <div className="page">
      <PageHeader title="My Books" subtitle="Currently borrowed and past books" />
      <div className="card">
        <div className="card-body" style={{ padding:0 }}>
          {loading ? <div style={{ padding:48, display:'flex', justifyContent:'center' }}><Spinner /></div>
            : <Table columns={columns} data={books} emptyIcon="📚" emptyTitle="No books borrowed" />}
        </div>
      </div>
    </div>
  );
}
