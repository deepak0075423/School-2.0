import React from 'react';
import useFetch from '../../../hooks/useFetch';
import { getMyBooks } from '../../../api/library.api';
import { PageHeader, Table, Badge, Spinner } from '../../../components/ui/index';

export default function LibraryMyBooks() {
  const { data: books, loading } = useFetch(getMyBooks);

  const statusColor = { active: 'success', returned: 'muted', overdue: 'danger' };

  const columns = [
    { key: 'book',      label: 'Book',     render: r => <strong>{r.book?.title || '—'}</strong> },
    { key: 'author',    label: 'Author',   render: r => r.book?.author || '—' },
    { key: 'issueDate', label: 'Issued',   render: r => r.issueDate ? new Date(r.issueDate).toLocaleDateString() : '—' },
    { key: 'dueDate',   label: 'Due Date', render: r => r.dueDate ? new Date(r.dueDate).toLocaleDateString() : '—' },
    { key: 'status',    label: 'Status',   render: r => <Badge variant={statusColor[r.status] || 'muted'}>{r.status}</Badge> },
  ];

  return (
    <div className="page">
      <PageHeader title="My Books" subtitle="Currently borrowed books" />
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={books} emptyIcon="📚" emptyTitle="No books currently borrowed" />}
        </div>
      </div>
    </div>
  );
}
