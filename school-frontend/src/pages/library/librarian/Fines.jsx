import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getFines, collectFine, waiveFine } from '../../../api/library.api';
import { PageHeader, Table, Badge, Button, Modal, Spinner, Pagination } from '../../../components/ui/index';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';

export default function LibraryFines() {
  const [statusFilter, setStatusFilter] = useState('pending');
  const [page, setPage] = useState(1);
  const { data, loading, refetch } = useFetch(
    () => getFines({ status: statusFilter || undefined, page, limit: 20 }),
    [statusFilter, page],
  );
  const fines = Array.isArray(data) ? data : [];

  const [waiveModal,  setWaiveModal]  = useState(null);
  const [waiveReason, setWaiveReason] = useState('');
  const [waiveLoad,   setWaiveLoad]   = useState(false);

  const handleCollect = async (id) => {
    try { await collectFine(id); toast.success('Fine collected'); refetch(); }
    catch (err) { toast.error(err?.response?.data?.message || err.message); }
  };

  const handleWaive = async () => {
    setWaiveLoad(true);
    try { await waiveFine(waiveModal._id, { reason: waiveReason }); toast.success('Fine waived'); setWaiveModal(null); refetch(); }
    catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setWaiveLoad(false); }
  };

  const statusColor = { pending: 'warning', paid: 'success', waived: 'muted' };

  const columns = [
    { key: 'user',    label: 'Member',   render: r => <div><div style={{ fontWeight:600 }}>{r.user?.name||'—'}</div><div style={{ fontSize:'.75rem',color:'var(--text-muted)' }}>{r.user?.email||''}</div></div> },
    { key: 'issued',  label: 'Issued',   render: r => fmtDate(r.issuance?.issueDate) },
    { key: 'due',     label: 'Was Due',  render: r => fmtDate(r.issuance?.dueDate) },
    { key: 'days',    label: 'Days Late',render: r => r.daysLate ?? '—' },
    { key: 'amount',  label: 'Amount',   render: r => <strong>₹{(r.amount||0).toLocaleString()}</strong> },
    { key: 'status',  label: 'Status',   render: r => <Badge variant={statusColor[r.status]||'muted'}>{r.status}</Badge> },
    { key: 'actions', label: '', render: r => r.status === 'pending' && (
      <div style={{ display:'flex', gap:4 }}>
        <Button size="sm" onClick={() => handleCollect(r._id)}>Collect</Button>
        <button className="btn btn-secondary btn-sm" onClick={() => { setWaiveReason(''); setWaiveModal(r); }}>Waive</button>
      </div>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="Library Fines" subtitle="Overdue fine management" />
      <div className="card">
        <div className="card-header" style={{ display:'flex', gap:8 }}>
          <select className="form-control" style={{ width:160 }} value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="waived">Waived</option>
          </select>
        </div>
        <div className="card-body" style={{ padding:0 }}>
          {loading ? <div style={{ padding:48, display:'flex', justifyContent:'center' }}><Spinner /></div>
            : <Table columns={columns} data={fines} emptyIcon="💵" emptyTitle="No fines found" />}
        </div>
        {data?.pages > 1 && <div className="card-footer"><Pagination page={page} pages={data.pages} total={data.total} onPage={setPage} /></div>}
      </div>

      <Modal open={!!waiveModal} onClose={() => setWaiveModal(null)} title="Waive Fine"
        footer={<><Button variant="secondary" onClick={() => setWaiveModal(null)}>Cancel</Button>
          <Button onClick={handleWaive} loading={waiveLoad}>Waive</Button></>}>
        <p style={{ marginBottom:12, color:'var(--text-muted)' }}>
          Waive ₹{(waiveModal?.amount||0).toLocaleString()} fine for <strong>{waiveModal?.user?.name}</strong>?
        </p>
        <div className="form-group"><label className="form-label">Reason</label>
          <textarea className="form-control" rows={2} value={waiveReason}
            onChange={e => setWaiveReason(e.target.value)} placeholder="Optional reason…" /></div>
      </Modal>
    </div>
  );
}
