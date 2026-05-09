import React, { useState } from 'react';
import useFetch from '../../../hooks/useFetch';
import { getStudentFees } from '../../../api/fees.api';
import { PageHeader, Table, Badge, Button, Spinner } from '../../../components/ui/index';

export default function AdminStudentFees() {
  const [search, setSearch] = useState('');
  const { data, loading } = useFetch(() => getStudentFees({ search }), [search]);

  const statusColor = { paid: 'success', unpaid: 'danger', partial: 'warning', waived: 'muted' };

  const columns = [
    { key: 'student',  label: 'Student',   render: r => <strong>{r.student?.name || '—'}</strong> },
    { key: 'class',    label: 'Class',     render: r => `${r.student?.class?.name || '—'} - ${r.student?.section?.name || '—'}` },
    { key: 'total',    label: 'Total (₹)', render: r => `₹${(r.totalAmount||0).toLocaleString()}` },
    { key: 'paid',     label: 'Paid (₹)',  render: r => `₹${(r.paidAmount||0).toLocaleString()}` },
    { key: 'due',      label: 'Due (₹)',   render: r => `₹${(r.dueAmount||0).toLocaleString()}` },
    { key: 'status',   label: 'Status',    render: r => <Badge variant={statusColor[r.status] || 'muted'}>{r.status}</Badge> },
  ];

  return (
    <div className="page">
      <PageHeader title="Student Fees" subtitle="All student fee records" />
      <div style={{ marginBottom: 16 }}>
        <input className="form-control" placeholder="Search student..." style={{ maxWidth: 280 }}
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={data?.fees || data} emptyIcon="📋" emptyTitle="No student fee records" />}
        </div>
      </div>
    </div>
  );
}
