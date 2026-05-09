import React from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import { getDashboard } from '../../api/teacher.api';
import { Spinner } from '../../components/ui/index';
import { useAuth } from '../../contexts/AuthContext';

export default function TeacherDashboard() {
  const { user }          = useAuth();
  const { data, loading } = useFetch(getDashboard);

  if (loading) return <div className="loading-page"><Spinner /></div>;

  const quickLinks = [
    { to: '/teacher/my-section',  icon: '🏛️', label: 'My Section',      color: '#dbeafe' },
    { to: '/teacher/attendance',  icon: '✅', label: 'Mark Attendance',  color: '#d1fae5' },
    { to: '/teacher/timetable',   icon: '🕐', label: 'My Timetable',    color: '#fef3c7' },
    { to: '/teacher/exams',       icon: '📝', label: 'Aptitude Exams',  color: '#ede9fe' },
    { to: '/teacher/results',     icon: '📊', label: 'Results',         color: '#ffedd5' },
    { to: '/teacher/leave',       icon: '🏖️', label: 'My Leave',        color: '#fee2e2' },
    { to: '/teacher/documents',   icon: '📁', label: 'Documents',       color: '#ccfbf1' },
    { to: '/teacher/payroll/ctc', icon: '💵', label: 'My Salary',       color: '#f0fdf4' },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Welcome, {user?.name?.split(' ')[0]}! 👋</h1>
          <p className="text-muted">Teacher Dashboard</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }}>
        {quickLinks.map(l => (
          <Link key={l.to} to={l.to}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              background: l.color, borderRadius: 'var(--radius-lg)', padding: '24px 16px',
              textDecoration: 'none', color: 'var(--text)', gap: 8,
              transition: 'transform .15s, box-shadow .15s', textAlign: 'center',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
          >
            <span style={{ fontSize: '2rem' }}>{l.icon}</span>
            <span style={{ fontWeight: 500, fontSize: '.9rem' }}>{l.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
