import React from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import { getDashboard, getModules } from '../../api/admin.api';
import { StatCard, Spinner } from '../../components/ui/index';

const ALL_MODULES = [
  { key: 'fees',         to: '/admin/fees/dashboard',    icon: '💰', label: 'Fees Management',  color: '#dbeafe' },
  { key: 'payroll',      to: '/admin/payroll/dashboard', icon: '💵', label: 'Payroll',           color: '#d1fae5' },
  { key: 'library',      to: '/admin/library/dashboard', icon: '📖', label: 'Library',           color: '#fef3c7' },
  { key: 'leave',        to: '/admin/leave',             icon: '🏖️', label: 'Leave Management',  color: '#ede9fe' },
  { key: 'document',     to: '/admin/documents',         icon: '📁', label: 'Documents',         color: '#ffedd5' },
  { key: 'holiday',      to: '/admin/holidays',          icon: '🎉', label: 'Holidays',          color: '#ccfbf1' },
  { key: 'notification', to: '/admin/notifications',     icon: '🔔', label: 'Notifications',     color: '#fee2e2' },
  { key: 'result',       to: '/admin/results',           icon: '📊', label: 'Results',           color: '#f0fdf4' },
  { key: 'attendance',   to: '/admin/attendance',        icon: '✅', label: 'Attendance',        color: '#ecfdf5' },
  { key: 'timetable',    to: '/admin/timetable',         icon: '📅', label: 'Timetable',         color: '#eff6ff' },
];

export default function AdminDashboard() {
  const { data: stats,   loading: statsLoading  } = useFetch(getDashboard);
  const { data: modules, loading: modulesLoading } = useFetch(getModules);

  if (statsLoading || modulesLoading) return <div className="loading-page"><Spinner /></div>;

  const enabledModules = ALL_MODULES.filter(m => modules?.[m.key]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Admin Dashboard</h1>
          <p className="text-muted">School management overview</p>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard icon="👨‍🏫" label="Teachers" value={stats?.teachers} color="blue"   />
        <StatCard icon="👨‍🎓" label="Students" value={stats?.students} color="green"  />
        <StatCard icon="👨‍👩‍👧" label="Parents"  value={stats?.parents}  color="orange" />
      </div>

      {enabledModules.length > 0 && (
        <>
          <h2 style={{ marginBottom: 16, fontSize: '1rem', fontWeight: 600 }}>Quick Access</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: 12 }}>
            {enabledModules.map(m => (
              <Link key={m.to} to={m.to}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: m.color, borderRadius: 'var(--radius-lg)', padding: '16px',
                  textDecoration: 'none', color: 'var(--text)', fontWeight: 500,
                  transition: 'transform .15s, box-shadow .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
              >
                <span style={{ fontSize: '1.5rem' }}>{m.icon}</span>
                <span style={{ fontSize: '.9rem' }}>{m.label}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
