import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { PageHeader, Table, Badge, Button, Spinner, Pagination, Confirm } from '../../components/ui/index';

export default function AdminLeave() {
  const [tab, setTab]       = useState('requests');
  const [page, setPage]     = useState(1);
  const [act, setAct]       = useState(null);
  const [actLoad, setAL]    = useState(false);

  const { data, loading, refetch } = useFetch(
    () => api.getLeaveRequests({ page, limit: 20 }),
    [page],
  );
  const { data: types } = useFetch(api.getLeaveTypes);

  const handleAction = async (id, action) => {
    setAL(true);
    try {
      if (action === 'approve') await api.approveLeave(id);
      else await api.rejectLeave(id, { reason: 'Rejected by admin' });
      toast.success(`Request ${action}d`);
      setAct(null); refetch();
    } catch (err) { toast.error(err.message); }
    finally { setAL(false); }
  };

  const reqColumns = [
    { key: 'teacher', label: 'Teacher',    render: r => r.teacher?.name || '—' },
    { key: 'type',    label: 'Type',       render: r => r.leaveType?.name || r.type || '—' },
    { key: 'from',    label: 'From',       render: r => r.startDate ? new Date(r.startDate).toLocaleDateString() : '—' },
    { key: 'to',      label: 'To',         render: r => r.endDate ? new Date(r.endDate).toLocaleDateString() : '—' },
    { key: 'days',    label: 'Days',       render: r => r.days || '—' },
    { key: 'status',  label: 'Status',     render: r =>
      <Badge variant={r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'warning'}>
        {r.status}
      </Badge> },
    { key: 'actions', label: 'Actions', render: r => r.status === 'pending' && (
      <div className="actions">
        <button className="btn btn-success btn-sm" onClick={() => handleAction(r._id, 'approve')}>Approve</button>
        <button className="btn btn-danger btn-sm"  onClick={() => handleAction(r._id, 'reject')}>Reject</button>
      </div>
    )},
  ];

  const typeColumns = [
    { key: 'name',    label: 'Leave Type',  render: r => <strong>{r.name}</strong> },
    { key: 'maxDays', label: 'Max Days/Year' },
    { key: 'isPaid',  label: 'Paid',        render: r => r.isPaid ? '✅ Yes' : '❌ No' },
  ];

  return (
    <div className="page">
      <PageHeader title="Leave Management" subtitle="Manage leave types and teacher requests" />

      <div className="tabs">
        {[['requests','Leave Requests'],['types','Leave Types'],['allocations','Allocations'],['reports','Reports']].map(([key,label]) => (
          <button key={key} className={`tab${tab===key?' active':''}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {tab === 'requests' && (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
              : <Table columns={reqColumns} data={data?.data} emptyIcon="🏖️" emptyTitle="No leave requests" />}
          </div>
          {data && <div className="card-footer"><Pagination page={page} pages={data.pages} total={data.total} onPage={setPage} /></div>}
        </div>
      )}

      {tab === 'types' && (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            <Table columns={typeColumns} data={types} emptyIcon="📋" emptyTitle="No leave types" />
          </div>
        </div>
      )}

      {tab === 'allocations' && (
        <div className="card"><div className="card-body"><p className="text-muted">Allocations module — use the form to allocate leaves to teachers.</p></div></div>
      )}

      {tab === 'reports' && (
        <div className="card"><div className="card-body"><p className="text-muted">Leave reports — filter by teacher, date range, or type.</p></div></div>
      )}
    </div>
  );
}
