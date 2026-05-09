import React, { useState } from 'react';
import useFetch from '../../hooks/useFetch';
import { getLogs } from '../../api/superAdmin.api';
import { PageHeader, Table, Pagination, Spinner, Badge } from '../../components/ui/index';

export default function Logs() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, loading } = useFetch(
    () => getLogs({ page, action: search, limit: 50 }),
    [page, search],
  );

  const columns = [
    { key: 'createdAt', label: 'Time', render: r => new Date(r.createdAt).toLocaleString() },
    { key: 'user',   label: 'User',   render: r => r.user?.name || '—' },
    { key: 'action', label: 'Action', render: r => <Badge variant="info">{r.action}</Badge> },
    { key: 'entity', label: 'Entity', render: r => r.entity || '—' },
    { key: 'details',label: 'Details', render: r =>
      <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>{r.details}</span> },
  ];

  return (
    <div className="page">
      <PageHeader title="Activity Logs" subtitle="System-wide audit trail" />

      <div className="card">
        <div className="card-header">
          <input className="form-control" style={{ maxWidth: 280 }}
            placeholder="🔍 Filter by action…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {loading
            ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={data?.data} emptyIcon="📋" emptyTitle="No logs found" />
          }
        </div>
        {data && (
          <div className="card-footer">
            <Pagination page={page} pages={data.pages} total={data.total} onPage={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}
