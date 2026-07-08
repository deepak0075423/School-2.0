import React from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import { getDashboard } from '../../../api/payroll.api';
import { PageHeader, StatCard, Spinner, Badge, Button } from '../../../components/ui/index';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const STATUS_COLOR = { draft: 'warning', reviewed: 'info', approved: 'primary', published: 'success' };

export default function PayrollAdminDashboard() {
  const { data, loading } = useFetch(getDashboard);

  if (loading) return <div className="loading-page"><Spinner /></div>;

  const d = data || {};
  const run  = d.currentRun;
  const runs = d.recentRuns || [];

  return (
    <div className="page">
      <PageHeader title="Payroll Dashboard" subtitle="Payroll overview"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to="/admin/payroll/runs"><Button>+ New Run</Button></Link>
            <Link to="/admin/payroll/assignments"><Button variant="secondary">🧑‍🏫 Assignments</Button></Link>
          </div>
        } />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16, marginBottom: 20 }}>
        <StatCard label="Total Employees"    value={d.totalEmployees || 0}    icon="👥" color="blue" />
        <StatCard label="Active Assignments" value={d.activeAssignments || 0} icon="📋" color="green" />
        <StatCard label="Current Run"
          value={run ? `${MONTHS[(run.month || 1) - 1]} ${run.year}` : 'None'}
          icon="⚙️" color="orange" />
        <StatCard label="Last Run Net"
          value={runs[0] ? fmt(runs[0].totalNet) : '—'}
          icon="💵" color="purple" />
      </div>

      {/* Current run card */}
      {run && (
        <Link to="/admin/payroll/runs" style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
          border: '1px solid var(--border)', borderLeft: '4px solid var(--primary)',
          borderRadius: 'var(--radius)', padding: '12px 16px',
          textDecoration: 'none', color: 'var(--text)', background: 'var(--bg-primary)',
        }}>
          <span style={{ fontSize: '1.3rem' }}>⚙️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: '.9rem' }}>
              {MONTHS[(run.month || 1) - 1]} {run.year} run — {run.totalEmployees ?? 0} employees · net {fmt(run.totalNet)}
            </div>
            <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
              Continue processing: draft → reviewed → approved → published →
            </div>
          </div>
          <Badge variant={STATUS_COLOR[run.status] || 'muted'}>{run.status}</Badge>
        </Link>
      )}

      {/* Recent runs */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="card-title">Recent Payroll Runs</h3>
          <Link to="/admin/payroll/runs" style={{ fontSize: '.82rem' }}>View all →</Link>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {runs.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
              No payroll runs yet — create one to compute salaries for all active assignments.
            </div>
          ) : (
            <table className="table" style={{ width: '100%' }}>
              <thead><tr><th>Period</th><th>Employees</th><th>Gross</th><th>Net</th><th>Status</th></tr></thead>
              <tbody>
                {runs.map(r => (
                  <tr key={r._id}>
                    <td><strong>{MONTHS[(r.month || 1) - 1]} {r.year}</strong></td>
                    <td>{r.totalEmployees ?? 0}</td>
                    <td>{fmt(r.totalGross)}</td>
                    <td><strong>{fmt(r.totalNet)}</strong></td>
                    <td><Badge variant={STATUS_COLOR[r.status] || 'muted'}>{r.status}</Badge></td>
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
