import React from 'react';
import useFetch from '../../../hooks/useFetch';
import { getMyFees, getMyPayments } from '../../../api/fees.api';
import { PageHeader, Table, Badge, Spinner } from '../../../components/ui/index';

export default function StudentMyFees() {
  const { data: fees,     loading: fl } = useFetch(getMyFees);
  const { data: payments, loading: pl } = useFetch(getMyPayments);

  const statusColor = { paid: 'success', unpaid: 'danger', partial: 'warning', waived: 'muted' };

  const feeCols = [
    { key: 'head',   label: 'Fee Head',  render: r => r.feeHead?.name || r.label || '—' },
    { key: 'amount', label: 'Amount',    render: r => `₹${(r.amount||0).toLocaleString()}` },
    { key: 'paid',   label: 'Paid',      render: r => `₹${(r.paidAmount||0).toLocaleString()}` },
    { key: 'due',    label: 'Due',       render: r => `₹${(r.dueAmount||0).toLocaleString()}` },
    { key: 'status', label: 'Status',    render: r => <Badge variant={statusColor[r.status] || 'muted'}>{r.status}</Badge> },
  ];

  const payCols = [
    { key: 'amount',    label: 'Amount',  render: r => `₹${(r.amount||0).toLocaleString()}` },
    { key: 'mode',      label: 'Mode',    render: r => r.mode || '—' },
    { key: 'reference', label: 'Ref.',    render: r => r.reference || '—' },
    { key: 'date',      label: 'Date',    render: r => new Date(r.createdAt).toLocaleDateString() },
    { key: 'status',    label: 'Status',  render: r => <Badge variant={statusColor[r.status] || 'muted'}>{r.status}</Badge> },
  ];

  return (
    <div className="page">
      <PageHeader title="My Fees" subtitle="Fee dues and payment history" />

      <div style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 12 }}>Fee Dues</h3>
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {fl ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
              : <Table columns={feeCols} data={fees?.fees || fees} emptyIcon="✅" emptyTitle="No fee dues" />}
          </div>
        </div>
      </div>

      <div>
        <h3 style={{ marginBottom: 12 }}>Payment History</h3>
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {pl ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
              : <Table columns={payCols} data={payments} emptyIcon="💳" emptyTitle="No payments yet" />}
          </div>
        </div>
      </div>
    </div>
  );
}
