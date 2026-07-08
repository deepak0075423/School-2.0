import React from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import { getDashboard, getModules } from '../../api/admin.api';
import { PageHeader, StatCard, Spinner } from '../../components/ui/index';

const REPORT_LINKS = [
  { module: 'fees',    to: '/admin/fees/reports',      icon: '💰', label: 'Fees Collection & Dues',
    desc: 'Collection summaries, outstanding dues and concession reports' },
  { module: 'fees',    to: '/admin/fees/dashboard',    icon: '📈', label: 'Fees Overview',
    desc: 'Collection progress and recent transactions at a glance' },
  { module: 'leave',   to: '/admin/leave',             icon: '🏖️', label: 'Leave Reports',
    desc: 'Leave usage per teacher with Excel export (Reports tab)' },
  { module: 'payroll', to: '/admin/payroll/dashboard', icon: '💵', label: 'Payroll Summary',
    desc: 'Run totals — gross, deductions and net payouts' },
  { module: 'library', to: '/admin/library/dashboard', icon: '📖', label: 'Library Overview',
    desc: 'Circulation, overdue books, reservations and fines' },
  { module: 'result',  to: '/admin/results',           icon: '📊', label: 'Exam Results',
    desc: 'Formal exam status, marks review and published results' },
  { module: 'aptitudeExam', to: '/admin/exams',        icon: '📝', label: 'Aptitude Exams',
    desc: 'Exams overview across the school with result status' },
  { module: 'attendance', to: '/admin/attendance',     icon: '✅', label: 'Attendance',
    desc: 'Teacher attendance regularization queue' },
];

export default function Reports() {
  const { data, loading }  = useFetch(getDashboard);
  const { data: modules }  = useFetch(getModules);
  if (loading) return <div className="loading-page"><Spinner /></div>;

  const links = REPORT_LINKS.filter(l => !l.module || modules?.[l.module]);

  return (
    <div className="page">
      <PageHeader title="Reports" subtitle="School analytics and insights" />

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <StatCard icon="👨‍🏫" label="Total Teachers"  value={data?.teachers} color="blue" />
        <StatCard icon="👨‍🎓" label="Total Students"  value={data?.students} color="green" />
        <StatCard icon="👨‍👩‍👧" label="Total Parents"   value={data?.parents}  color="orange" />
        <StatCard icon="🏛️" label="Active Sections" value={data?.sections} color="purple" />
      </div>

      <h2 style={{ marginBottom: 14, fontSize: '1rem', fontWeight: 600 }}>Detailed reports</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 16 }}>
        {links.map(item => (
          <Link key={item.label} to={item.to}
            style={{
              display: 'block', background: 'var(--bg-card, var(--bg-primary))', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', padding: 20, transition: 'box-shadow .2s, transform .15s',
              textDecoration: 'none', color: 'inherit',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = ''; }}>
            <div style={{ fontSize: '1.8rem', marginBottom: 8 }}>{item.icon}</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{item.label}</div>
            <div style={{ fontSize: '.82rem', color: 'var(--text-muted)' }}>{item.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
