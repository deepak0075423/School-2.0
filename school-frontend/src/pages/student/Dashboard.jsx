import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import useFetch from '../../hooks/useFetch';
import { getDashboard } from '../../api/student.api';
import { Spinner } from '../../components/ui/index';

export default function StudentDashboard() {
  const { user }          = useAuth();
  const { data, loading } = useFetch(getDashboard);

  if (loading) return <div className="loading-page"><Spinner /></div>;

  const quickLinks = [
    { to: '/student/my-class',   icon: '🏛️', label: 'My Class',      color: '#dbeafe' },
    { to: '/student/timetable',  icon: '🕐', label: 'Timetable',     color: '#d1fae5' },
    { to: '/student/attendance', icon: '✅', label: 'My Attendance', color: '#fef3c7' },
    { to: '/student/exams',      icon: '📝', label: 'Exams',         color: '#ede9fe' },
    { to: '/student/results',    icon: '📊', label: 'Results',       color: '#ffedd5' },
    { to: '/student/fees',       icon: '💰', label: 'My Fees',       color: '#d1fae5' },
    { to: '/student/library',    icon: '📖', label: 'Library',       color: '#ccfbf1' },
    { to: '/student/documents',  icon: '📁', label: 'Documents',     color: '#fee2e2' },
    { to: '/student/holidays',   icon: '🎉', label: 'Holidays',      color: '#fef3c7' },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Hello, {user?.name?.split(' ')[0]}! 👋</h1>
          <p className="text-muted">Student Portal</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12 }}>
        {quickLinks.map(l => (
          <Link key={l.to} to={l.to}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              background: l.color, borderRadius: 'var(--radius-lg)', padding: '20px 12px',
              textDecoration: 'none', color: 'var(--text)', gap: 8,
              transition: 'transform .15s, box-shadow .15s', textAlign: 'center',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
          >
            <span style={{ fontSize: '1.8rem' }}>{l.icon}</span>
            <span style={{ fontWeight: 500, fontSize: '.85rem' }}>{l.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
