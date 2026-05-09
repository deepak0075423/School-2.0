import React from 'react';
import useFetch from '../../../hooks/useFetch';
import { getMyPayslips } from '../../../api/payroll.api';
import { PageHeader, Table, Badge, Button, Spinner } from '../../../components/ui/index';

export default function TeacherPayslips() {
  const { data: payslips, loading } = useFetch(getMyPayslips);

  const statusColor = { draft: 'warning', published: 'success' };

  const columns = [
    { key: 'period',  label: 'Period',  render: r => `${r.month} ${r.year}` },
    { key: 'gross',   label: 'Gross',   render: r => `₹${(r.grossPay||0).toLocaleString()}` },
    { key: 'net',     label: 'Net Pay', render: r => <strong>₹{(r.netPay||0).toLocaleString()}</strong> },
    { key: 'status',  label: 'Status',  render: r => <Badge variant={statusColor[r.status] || 'muted'}>{r.status}</Badge> },
    { key: 'actions', label: '',        render: r => r.status === 'published' && (
      <Button size="sm" variant="secondary">Download PDF</Button>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="My Payslips" subtitle="Monthly salary slips" />
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={payslips} emptyIcon="📄" emptyTitle="No payslips yet" />}
        </div>
      </div>
    </div>
  );
}
