import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import useFetch from '../../hooks/useFetch';
import { getChildFees } from '../../api/fees.api';
import { PageHeader, Table, Badge, Spinner, Card } from '../../components/ui/index';

export default function ParentChildFees() {
  const { user } = useAuth();
  const childId  = user?.children?.[0]?._id || user?.linkedStudent;

  const { data, loading } = useFetch(
    () => childId ? getChildFees(childId) : Promise.resolve(null),
    [childId],
  );

  const statusColor = { paid: 'success', unpaid: 'danger', partial: 'warning', waived: 'muted' };

  const columns = [
    { key: 'head',   label: 'Fee Head',  render: r => r.feeHead?.name || r.label || '—' },
    { key: 'amount', label: 'Amount',    render: r => `₹${(r.amount||0).toLocaleString()}` },
    { key: 'paid',   label: 'Paid',      render: r => `₹${(r.paidAmount||0).toLocaleString()}` },
    { key: 'due',    label: 'Due',       render: r => `₹${(r.dueAmount||0).toLocaleString()}` },
    { key: 'status', label: 'Status',    render: r => <Badge variant={statusColor[r.status] || 'muted'}>{r.status}</Badge> },
  ];

  return (
    <div className="page">
      <PageHeader title="Child's Fees" subtitle="Fee details and payment history" />
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
      ) : (
        <>
          {data?.summary && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Total Fees',  value: `₹${(data.summary.total||0).toLocaleString()}`,    bg: '#dbeafe' },
                { label: 'Paid',        value: `₹${(data.summary.paid||0).toLocaleString()}`,     bg: '#d1fae5' },
                { label: 'Due',         value: `₹${(data.summary.due||0).toLocaleString()}`,      bg: '#fee2e2' },
                { label: 'Fine',        value: `₹${(data.summary.fine||0).toLocaleString()}`,     bg: '#fef3c7' },
              ].map(s => (
                <div key={s.label} style={{ background: s.bg, borderRadius: 'var(--radius)', padding: '16px 20px' }}>
                  <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{s.value}</div>
                </div>
              ))}
            </div>
          )}
          <div className="card">
            <div className="card-body" style={{ padding: 0 }}>
              <Table columns={columns} data={data?.fees} emptyIcon="💰" emptyTitle="No fee records" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
