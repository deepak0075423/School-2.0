import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getReservations, markReservationReady, cancelReservation } from '../../../api/library.api';
import { PageHeader, Table, Badge, Button, Confirm, Spinner, Pagination } from '../../../components/ui/index';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';

export default function LibraryReservations() {
  const [statusFilter, setStatusFilter] = useState('pending');
  const [page, setPage] = useState(1);
  const { data, loading, refetch } = useFetch(
    () => getReservations({ status: statusFilter || undefined, page, limit: 20 }),
    [statusFilter, page],
  );
  const reservations = Array.isArray(data) ? data : [];

  const [cancelItem, setCancelItem] = useState(null);
  const [cancelLoad, setCancelLoad] = useState(false);
  const [actLoad,    setActLoad]    = useState(null);

  const handleReady = async (id) => {
    setActLoad(id);
    try { await markReservationReady(id); toast.success('Marked as ready'); refetch(); }
    catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setActLoad(null); }
  };

  const handleCancel = async () => {
    setCancelLoad(true);
    try { await cancelReservation(cancelItem._id); toast.success('Reservation cancelled'); setCancelItem(null); refetch(); }
    catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setCancelLoad(false); }
  };

  const statusColor = { pending: 'warning', ready: 'success', fulfilled: 'muted', cancelled: 'danger', expired: 'danger' };

  const columns = [
    { key: 'book',     label: 'Book',     render: r => <div><div style={{ fontWeight:600 }}>{r.book?.title||'—'}</div><div style={{ fontSize:'.75rem',color:'var(--text-muted)' }}>{r.book?.isbn||''}</div></div> },
    { key: 'member',   label: 'Reserved By', render: r => r.reservedBy?.name || '—' },
    { key: 'queue',    label: 'Queue #',   render: r => `#${r.queuePosition||1}` },
    { key: 'date',     label: 'Date',      render: r => fmtDate(r.reservedAt || r.createdAt) },
    { key: 'ready',    label: 'Ready At',  render: r => r.readyAt ? fmtDate(r.readyAt) : '—' },
    { key: 'expires',  label: 'Expires',   render: r => r.expiresAt ? fmtDate(r.expiresAt) : '—' },
    { key: 'status',   label: 'Status',    render: r => <Badge variant={statusColor[r.status]||'muted'}>{r.status}</Badge> },
    { key: 'actions',  label: '', render: r => (
      <div style={{ display:'flex', gap:4 }}>
        {r.status === 'pending' && (
          <Button size="sm" loading={actLoad === r._id} onClick={() => handleReady(r._id)}>Mark Ready</Button>
        )}
        {(r.status === 'pending' || r.status === 'ready') && (
          <button className="btn btn-danger btn-sm" onClick={() => setCancelItem(r)}>Cancel</button>
        )}
      </div>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="Reservations" subtitle="Book reservation queue" />
      <div className="card">
        <div className="card-header" style={{ display:'flex', gap:8 }}>
          <select className="form-control" style={{ width:160 }} value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="ready">Ready</option>
            <option value="fulfilled">Fulfilled</option>
            <option value="cancelled">Cancelled</option>
            <option value="expired">Expired</option>
          </select>
        </div>
        <div className="card-body" style={{ padding:0 }}>
          {loading ? <div style={{ padding:48, display:'flex', justifyContent:'center' }}><Spinner /></div>
            : <Table columns={columns} data={reservations} emptyIcon="🔖" emptyTitle="No reservations found" />}
        </div>
        {data?.pages > 1 && <div className="card-footer"><Pagination page={page} pages={data.pages} total={data.total} onPage={setPage} /></div>}
      </div>

      <Confirm open={!!cancelItem} onClose={() => setCancelItem(null)} onConfirm={handleCancel}
        loading={cancelLoad} title="Cancel Reservation"
        message={`Cancel ${cancelItem?.reservedBy?.name}'s reservation for "${cancelItem?.book?.title}"?`} />
    </div>
  );
}
