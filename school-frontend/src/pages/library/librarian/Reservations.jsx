import React from 'react';
import useFetch from '../../../hooks/useFetch';
import { getReservations } from '../../../api/library.api';
import { PageHeader, Table, Badge, Spinner } from '../../../components/ui/index';

export default function LibraryReservations() {
  const { data: reservations, loading } = useFetch(getReservations);

  const statusColor = { pending: 'warning', fulfilled: 'success', cancelled: 'muted', expired: 'danger' };

  const columns = [
    { key: 'user',       label: 'Member',   render: r => <strong>{r.user?.name || '—'}</strong> },
    { key: 'book',       label: 'Book',     render: r => r.book?.title || '—' },
    { key: 'reservedAt', label: 'Reserved', render: r => r.reservedAt ? new Date(r.reservedAt).toLocaleDateString() : '—' },
    { key: 'status',     label: 'Status',   render: r => <Badge variant={statusColor[r.status] || 'muted'}>{r.status}</Badge> },
  ];

  return (
    <div className="page">
      <PageHeader title="Reservations" subtitle="Book reservation requests" />
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={reservations} emptyIcon="🔖" emptyTitle="No reservations" />}
        </div>
      </div>
    </div>
  );
}
