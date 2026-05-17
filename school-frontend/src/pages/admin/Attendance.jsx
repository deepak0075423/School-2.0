import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import { getRegularizationRequests, reviewRegularization } from '../../api/admin.api';
import { PageHeader, Table, Badge, Spinner, Pagination } from '../../components/ui/index';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function AdminAttendance() {
  const [page,   setPage]   = useState(1);
  const [status, setStatus] = useState('pending');

  const { data, loading, refetch } = useFetch(
    () => getRegularizationRequests({ page, limit: 20, status: status || undefined }),
    [page, status],
  );
  const requests = data?.data || [];

  const handleReview = async (id, st) => {
    try {
      await reviewRegularization({ id, status: st });
      toast.success(st === 'approved' ? 'Approved' : 'Rejected');
      refetch();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
  };

  const columns = [
    { key: 'teacher',  label: 'Teacher',
      render: r => <div><div style={{ fontWeight: 600 }}>{r.teacher?.name || '—'}</div><div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{r.teacher?.email || ''}</div></div> },
    { key: 'date',     label: 'Date',      render: r => fmtDate(r.date) },
    { key: 'reason',   label: 'Reason',    render: r => <span style={{ fontSize: '.85rem' }}>{r.reason || '—'}</span> },
    { key: 'checkIn',  label: 'Check-In',  render: r => r.checkIn  || '—' },
    { key: 'checkOut', label: 'Check-Out', render: r => r.checkOut || '—' },
    { key: 'remarks',  label: 'Remarks',   render: r => <span style={{ fontSize: '.82rem', color: 'var(--text-muted)' }}>{r.remarks || '—'}</span> },
    { key: 'status',   label: 'Status',
      render: r => <Badge variant={r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'warning'}>{r.status}</Badge> },
    { key: 'actions',  label: '',
      render: r => r.status === 'pending' && (
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn-success btn-sm" onClick={() => handleReview(r._id, 'approved')}>Approve</button>
          <button className="btn btn-danger btn-sm"  onClick={() => handleReview(r._id, 'rejected')}>Reject</button>
        </div>
      )},
  ];

  return (
    <div className="page">
      <PageHeader title="Attendance" subtitle="Teacher attendance regularization requests" />
      <div className="card">
        <div className="card-header" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="form-control" style={{ width: 160 }} value={status}
            onChange={e => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          {loading && <Spinner />}
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <Table columns={columns} data={requests} emptyIcon="✅" emptyTitle="No requests found" />
        </div>
        {data?.total > 20 && (
          <div className="card-footer">
            <Pagination page={page} pages={Math.ceil((data.total || 0) / 20)} total={data.total} onPage={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}
