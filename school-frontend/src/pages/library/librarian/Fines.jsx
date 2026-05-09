import React from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getFines, collectFine } from '../../../api/library.api';
import { PageHeader, Table, Badge, Button, Spinner } from '../../../components/ui/index';

export default function LibraryFines() {
  const { data: fines, loading, refetch } = useFetch(getFines);

  const handleCollect = async (id) => {
    try {
      await collectFine(id);
      toast.success('Fine collected');
      refetch();
    } catch (err) { toast.error(err.message); }
  };

  const statusColor = { pending: 'warning', paid: 'success', waived: 'muted' };

  const columns = [
    { key: 'user',    label: 'Member',  render: r => <strong>{r.user?.name || '—'}</strong> },
    { key: 'book',    label: 'Book',    render: r => r.issuance?.book?.title || '—' },
    { key: 'amount',  label: 'Amount',  render: r => `₹${(r.amount||0).toLocaleString()}` },
    { key: 'days',    label: 'Days Late',render: r => r.daysLate || '—' },
    { key: 'status',  label: 'Status',  render: r => <Badge variant={statusColor[r.status] || 'muted'}>{r.status}</Badge> },
    { key: 'actions', label: '',        render: r => r.status === 'pending' && (
      <Button size="sm" onClick={() => handleCollect(r._id)}>Collect</Button>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="Library Fines" subtitle="Overdue fines management" />
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={fines} emptyIcon="💵" emptyTitle="No fines" />}
        </div>
      </div>
    </div>
  );
}
