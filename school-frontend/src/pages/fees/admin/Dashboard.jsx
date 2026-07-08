import React from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import { getAdminDashboard } from '../../../api/fees.api';
import { PageHeader, StatCard, Spinner, Badge, Button } from '../../../components/ui/index';

const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const STATUS_COLOR = { pending: 'warning', completed: 'success', failed: 'danger', refunded: 'muted' };

export default function FeesAdminDashboard() {
  const { data, loading } = useFetch(getAdminDashboard);

  if (loading) return <div className="loading-page"><Spinner /></div>;

  const d = data || {};
  const totalDemand   = (d.totalCollected || 0) + Math.max(0, d.pendingDues || 0);
  const collectionPct = totalDemand > 0 ? Math.round(((d.totalCollected || 0) / totalDemand) * 100) : 0;
  const pendingCount  = (d.recentPayments || []).filter(p => p.paymentStatus === 'pending').length;

  return (
    <div className="page">
      <PageHeader title="Fees Dashboard" subtitle="Fee collection overview"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to="/admin/fees/payments"><Button>+ Record Payment</Button></Link>
            <Link to="/admin/fees/reports"><Button variant="secondary">📈 Reports</Button></Link>
          </div>
        } />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16, marginBottom: 20 }}>
        <StatCard label="Total Collected"    value={fmt(d.totalCollected)}  icon="💰" color="green" />
        <StatCard label="Pending Dues"       value={fmt(d.pendingDues)}     icon="⚠️" color="red" />
        <StatCard label="Total Students"     value={d.totalStudents || 0}   icon="👥" color="blue" />
        <StatCard label="Total Transactions" value={d.totalTransactions || 0} icon="📋" color="purple" />
      </div>

      {/* Collection progress */}
      {totalDemand > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-body">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '.88rem' }}>
              <strong>Collection progress</strong>
              <span>{collectionPct}% of {fmt(totalDemand)}</span>
            </div>
            <div style={{ height: 10, background: 'var(--bg-secondary)', borderRadius: 5, overflow: 'hidden' }}>
              <div style={{ width: `${collectionPct}%`, height: '100%', background: collectionPct >= 60 ? 'var(--success, #22c55e)' : 'var(--warning, #f59e0b)' }} />
            </div>
          </div>
        </div>
      )}

      {/* Pending approvals nudge */}
      {pendingCount > 0 && (
        <Link to="/admin/fees/payments" style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
          border: '1px solid var(--border)', borderLeft: '4px solid var(--warning, #f59e0b)',
          borderRadius: 'var(--radius)', padding: '12px 16px',
          textDecoration: 'none', color: 'var(--text)', background: 'var(--bg-primary)',
        }}>
          <span style={{ fontSize: '1.3rem' }}>💳</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: '.9rem' }}>Payments submitted by students/parents are waiting for verification</div>
            <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>Open Payments to approve or reject →</div>
          </div>
        </Link>
      )}

      {/* Recent payments */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="card-title">Recent Payments</h3>
          <Link to="/admin/fees/payments" style={{ fontSize: '.82rem' }}>View all →</Link>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {(d.recentPayments || []).length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>No payments yet</div>
          ) : (
            <table className="table" style={{ width: '100%' }}>
              <thead><tr><th>Student</th><th>Receipt</th><th>Amount</th><th>Mode</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>
                {d.recentPayments.map(p => (
                  <tr key={p._id}>
                    <td><strong>{p.student?.name || p.studentSnapshot?.name || '—'}</strong></td>
                    <td className="text-muted">{p.receiptNumber || '—'}</td>
                    <td><strong>{fmt(p.amount)}</strong></td>
                    <td className="text-muted">{(p.paymentMode || '—').replace('_', ' ')}</td>
                    <td className="text-muted text-sm">{p.paymentDate ? new Date(p.paymentDate).toLocaleDateString('en-IN') : '—'}</td>
                    <td><Badge variant={STATUS_COLOR[p.paymentStatus] || 'muted'}>{p.paymentStatus}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
