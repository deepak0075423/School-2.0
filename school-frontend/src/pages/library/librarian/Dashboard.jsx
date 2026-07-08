import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import { getDashboard } from '../../../api/library.api';
import { PageHeader, StatCard, Spinner, Badge, Button } from '../../../components/ui/index';

const ISSUE_STATUS = { issued: 'info', returned: 'success', overdue: 'danger', lost: 'muted' };

export default function LibraryDashboard() {
  const { data, loading } = useFetch(getDashboard);
  // Same page serves admins (/admin/library) and librarian teachers (/teacher/manage-library)
  const base = useLocation().pathname.startsWith('/teacher') ? '/teacher/manage-library' : '/admin/library';

  if (loading) return <div className="loading-page"><Spinner /></div>;

  const d = data || {};

  return (
    <div className="page">
      <PageHeader title="Library Dashboard" subtitle="Library management overview"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to={`${base}/circulation`}><Button>🔄 Issue / Return</Button></Link>
            <Link to={`${base}/books`}><Button variant="secondary">+ Add Book</Button></Link>
          </div>
        } />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 16, marginBottom: 20 }}>
        <StatCard label="Titles"        value={d.totalBooks || 0}    icon="📚" color="blue" />
        <StatCard label="Copies"        value={d.totalCopies || 0}   icon="📖" color="blue" />
        <StatCard label="Issued Out"    value={d.issuedCopies || 0}  icon="📤" color="green" />
        <StatCard label="Overdue"       value={d.overdue || 0}       icon="⚠️" color="red" />
        <StatCard label="Reservations"  value={d.reservations || 0}  icon="🔖" color="orange" />
        <StatCard label="Pending Fines" value={d.pendingFines || 0}  icon="💸" color="purple" />
      </div>

      {/* Attention nudges */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 12, marginBottom: 20 }}>
        {d.overdue > 0 && (
          <Link to={`${base}/circulation`} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            border: '1px solid var(--border)', borderLeft: '4px solid var(--danger, #ef4444)',
            borderRadius: 'var(--radius)', padding: '12px 16px',
            textDecoration: 'none', color: 'var(--text)', background: 'var(--bg-primary)',
          }}>
            <span style={{ fontSize: '1.3rem' }}>⚠️</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{d.overdue} overdue issuance{d.overdue !== 1 ? 's' : ''}</div>
              <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>Follow up in Circulation →</div>
            </div>
          </Link>
        )}
        {d.reservations > 0 && (
          <Link to={`${base}/reservations`} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            border: '1px solid var(--border)', borderLeft: '4px solid var(--warning, #f59e0b)',
            borderRadius: 'var(--radius)', padding: '12px 16px',
            textDecoration: 'none', color: 'var(--text)', background: 'var(--bg-primary)',
          }}>
            <span style={{ fontSize: '1.3rem' }}>🔖</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{d.reservations} reservation{d.reservations !== 1 ? 's' : ''} waiting</div>
              <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>Mark ready for pickup →</div>
            </div>
          </Link>
        )}
      </div>

      {/* Recent issuances */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="card-title">Recent Issuances</h3>
          <Link to={`${base}/circulation`} style={{ fontSize: '.82rem' }}>View all →</Link>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {(d.recent || []).length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>No books issued yet</div>
          ) : (
            <table className="table" style={{ width: '100%' }}>
              <thead><tr><th>Book</th><th>Issued to</th><th>Issue date</th><th>Due date</th><th>Status</th></tr></thead>
              <tbody>
                {d.recent.map(i => (
                  <tr key={i._id}>
                    <td><strong>{i.book?.title || '—'}</strong></td>
                    <td>{i.issuedTo?.name || '—'}</td>
                    <td className="text-muted text-sm">{i.issueDate ? new Date(i.issueDate).toLocaleDateString('en-IN') : '—'}</td>
                    <td className="text-muted text-sm">{i.dueDate ? new Date(i.dueDate).toLocaleDateString('en-IN') : '—'}</td>
                    <td><Badge variant={ISSUE_STATUS[i.status] || 'muted'}>{i.status}</Badge></td>
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
