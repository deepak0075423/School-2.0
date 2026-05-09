import React from 'react';
import useFetch from '../../hooks/useFetch';
import { getRegularizationRequests, reviewRegularization } from '../../api/admin.api';
import { PageHeader, Table, Badge, Spinner } from '../../components/ui/index';
import toast from 'react-hot-toast';

export default function Attendance() {
  const { data, loading, refetch } = useFetch(getRegularizationRequests);

  const handleReview = async (id, status) => {
    try { await reviewRegularization({ id, status }); toast.success('Done'); refetch(); }
    catch (err) { toast.error(err.message); }
  };

  const columns = [
    { key: 'teacher', label: 'Teacher',   render: r => r.teacher?.name || '—' },
    { key: 'date',    label: 'Date',      render: r => r.date ? new Date(r.date).toLocaleDateString() : '—' },
    { key: 'reason',  label: 'Reason' },
    { key: 'status',  label: 'Status',   render: r =>
      <Badge variant={r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'warning'}>{r.status}</Badge> },
    { key: 'actions', label: 'Actions',  render: r => r.status === 'pending' && (
      <div className="actions">
        <button className="btn btn-success btn-sm" onClick={() => handleReview(r._id, 'approved')}>Approve</button>
        <button className="btn btn-danger btn-sm"  onClick={() => handleReview(r._id, 'rejected')}>Reject</button>
      </div>
    )},
  ];

  if (loading) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page">
      <PageHeader title="Attendance" subtitle="Teacher regularization requests" />
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <Table columns={columns} data={data} emptyIcon="✅" emptyTitle="No pending requests" />
        </div>
      </div>
    </div>
  );
}
