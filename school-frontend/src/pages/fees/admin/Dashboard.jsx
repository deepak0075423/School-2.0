import React from 'react';
import useFetch from '../../../hooks/useFetch';
import { getAdminDashboard } from '../../../api/fees.api';
import { PageHeader, StatCard, Spinner } from '../../../components/ui/index';

export default function FeesAdminDashboard() {
  const { data, loading } = useFetch(getAdminDashboard);

  if (loading) return <div className="loading-page"><Spinner /></div>;

  const d = data?.data || {};
  const stats = [
    { label: 'Total Collected',    value: `₹${(d.totalCollected||0).toLocaleString()}`,   icon: '💰', color: '#d1fae5' },
    { label: 'Pending Dues',       value: `₹${(d.pendingDues||0).toLocaleString()}`,      icon: '⚠️', color: '#fee2e2' },
    { label: 'Total Students',     value: d.totalStudents || 0,                            icon: '👥', color: '#dbeafe' },
    { label: 'Total Transactions', value: d.totalTransactions || 0,                        icon: '📋', color: '#fef3c7' },
  ];

  return (
    <div className="page">
      <PageHeader title="Fees Dashboard" subtitle="Fee collection overview" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16, marginBottom: 24 }}>
        {stats.map(s => <StatCard key={s.label} {...s} />)}
      </div>
      {d.recentPayments?.length > 0 && (
        <div className="card">
          <div className="card-header"><h3 className="card-title">Recent Payments</h3></div>
          <div className="card-body" style={{ padding: 0 }}>
            <table className="table"><tbody>
              {d.recentPayments.map(p => (
                <tr key={p._id}>
                  <td><strong>{p.student?.name}</strong></td>
                  <td className="text-muted">{p.feeHead?.name || '—'}</td>
                  <td>₹{(p.amount||0).toLocaleString()}</td>
                  <td className="text-muted text-sm">{new Date(p.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        </div>
      )}
    </div>
  );
}
