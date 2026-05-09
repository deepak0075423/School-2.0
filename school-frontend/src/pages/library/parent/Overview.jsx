import React from 'react';
import useFetch from '../../../hooks/useFetch';
import { getMyBooks, getMyFines } from '../../../api/library.api';
import { PageHeader, Table, Badge, Spinner } from '../../../components/ui/index';

export default function LibraryParentOverview() {
  const { data: books, loading: bl } = useFetch(getMyBooks);
  const { data: fines, loading: fl } = useFetch(getMyFines);

  const statusColor = { active: 'success', overdue: 'danger', returned: 'muted', pending: 'warning', paid: 'success' };

  return (
    <div className="page">
      <PageHeader title="Library Overview" subtitle="Child's library activity" />

      <div style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 12 }}>Books Borrowed</h3>
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {bl ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
              : <Table
                  columns={[
                    { key: 'book',     label: 'Book',    render: r => <strong>{r.book?.title || '—'}</strong> },
                    { key: 'dueDate',  label: 'Due',     render: r => r.dueDate ? new Date(r.dueDate).toLocaleDateString() : '—' },
                    { key: 'status',   label: 'Status',  render: r => <Badge variant={statusColor[r.status] || 'muted'}>{r.status}</Badge> },
                  ]}
                  data={books} emptyIcon="📚" emptyTitle="No books borrowed" />}
          </div>
        </div>
      </div>

      <div>
        <h3 style={{ marginBottom: 12 }}>Fines</h3>
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {fl ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
              : <Table
                  columns={[
                    { key: 'book',   label: 'Book',   render: r => r.issuance?.book?.title || '—' },
                    { key: 'amount', label: 'Amount', render: r => `₹${(r.amount||0).toLocaleString()}` },
                    { key: 'status', label: 'Status', render: r => <Badge variant={statusColor[r.status] || 'muted'}>{r.status}</Badge> },
                  ]}
                  data={fines} emptyIcon="✅" emptyTitle="No fines" />}
          </div>
        </div>
      </div>
    </div>
  );
}
