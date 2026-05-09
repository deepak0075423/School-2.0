import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import useFetch from '../../hooks/useFetch';
import { getDashboard } from '../../api/parent.api';
import { Spinner, StatCard } from '../../components/ui/index';

export default function ParentDashboard() {
  const { user }          = useAuth();
  const { data, loading } = useFetch(getDashboard);

  if (loading) return <div className="loading-page"><Spinner /></div>;

  const quickLinks = [
    { to: '/parent/child-class',      icon: '🏛️', label: 'Child\'s Class',  color: '#dbeafe' },
    { to: '/parent/child-attendance', icon: '✅', label: 'Attendance',      color: '#d1fae5' },
    { to: '/parent/exams',            icon: '📝', label: 'Exams',           color: '#ede9fe' },
    { to: '/parent/results',          icon: '📊', label: 'Results',         color: '#ffedd5' },
    { to: '/parent/child-fees',       icon: '💰', label: 'Fees',            color: '#fef3c7' },
    { to: '/parent/documents',        icon: '📁', label: 'Documents',       color: '#fee2e2' },
    { to: '/parent/holidays',         icon: '🎉', label: 'Holidays',        color: '#ccfbf1' },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Hello, {user?.name?.split(' ')[0]}! 👋</h1>
          <p className="text-muted">Parent Portal</p>
        </div>
      </div>

      {data?.child && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>👦</div>
              <div>
                <strong style={{ fontSize: '1.05rem' }}>{data.child.name}</strong>
                <p className="text-muted text-sm" style={{ margin: 0 }}>{data.child.class} • {data.child.section}</p>
              </div>
            </div>
          </div>
        </div>
      )}

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
