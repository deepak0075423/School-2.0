import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import {
  getRegularizationRequests, reviewRegularization,
  getMyAttendance, clockIn, clockOut, submitRegularization, getMyRegularizations,
} from '../../api/admin.api';
import { PageHeader, Table, Badge, Spinner } from '../../components/ui/index';
import SelfAttendance from '../../components/attendance/SelfAttendance';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// ── Tab 2: Teacher regularization requests ────────────────────────────────────
function RegularizationRequests() {
  const [status, setStatus] = useState('pending');

  const { data, loading, refetch } = useFetch(
    () => getRegularizationRequests({ page: 1, limit: 100, status: status || undefined }),
    [status],
  );
  const requests = Array.isArray(data) ? data : [];

  const handleReview = async (id, st) => {
    try {
      await reviewRegularization({ id, status: st });
      toast.success(st === 'approved' ? 'Approved — attendance record updated' : 'Rejected');
      refetch();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
  };

  const columns = [
    { key: 'teacher',  label: 'Staff',
      render: r => <div><div style={{ fontWeight: 600 }}>{r.teacher?.name || '—'}</div><div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{r.teacher?.email || ''}</div></div> },
    { key: 'date',     label: 'Date',      render: r => fmtDate(r.date) },
    { key: 'times',    label: 'Requested Times', render: r => (r.checkIn || r.checkOut)
      ? <span style={{ fontSize: '.85rem' }}>
          {r.checkIn  && <>in <strong>{r.checkIn}</strong></>}
          {r.checkIn && r.checkOut && ' · '}
          {r.checkOut && <>out <strong>{r.checkOut}</strong></>}
        </span>
      : <span style={{ textTransform: 'capitalize' }}>{(r.requestedStatus || '—').toLowerCase()}</span> },
    { key: 'reason',   label: 'Reason',    render: r => <span style={{ fontSize: '.85rem' }}>{r.reason || '—'}</span> },
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
    <div className="card">
      <div className="card-header" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select className="form-control" style={{ width: 160 }} value={status}
          onChange={e => setStatus(e.target.value)}>
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
    </div>
  );
}

export default function AdminAttendance() {
  const [tab, setTab] = useState('my-attendance');

  return (
    <div className="page">
      <PageHeader title="Attendance" subtitle="Clock your day and review staff regularization requests" />

      <div className="tabs">
        {[['my-attendance', 'My Attendance'], ['requests', 'Regularization Requests']].map(([k, l]) => (
          <button key={k} className={`tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'my-attendance' && (
        <SelfAttendance
          api={{ getMyAttendance, clockIn, clockOut }}
          regularization={{ submit: submitRegularization, list: getMyRegularizations }}
        />
      )}
      {tab === 'requests' && <RegularizationRequests />}
    </div>
  );
}
