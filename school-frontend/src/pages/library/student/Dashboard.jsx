import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import useFetch from '../../../hooks/useFetch';
import { getMyBooks, getMyFines } from '../../../api/library.api';
import { PageHeader, Spinner } from '../../../components/ui/index';

export default function LibraryStudentDashboard() {
  const { user }                        = useAuth();
  const { data: books,  loading: bl }   = useFetch(getMyBooks);
  const { data: fines,  loading: fl }   = useFetch(getMyFines);

  const isTeacher = user?.role === 'teacher';
  const basePath  = isTeacher ? '/teacher/library' : '/student/library';

  const pendingFines = (fines || []).filter(f => f.status === 'pending').length;
  const activeBooks  = (books  || []).filter(b => b.status === 'active').length;

  const quickLinks = [
    { to: `${basePath}/search`,   icon: '🔍', label: 'Search Books', color: '#dbeafe' },
    { to: `${basePath}/my-books`, icon: '📚', label: 'My Books',     color: '#d1fae5' },
    { to: `${basePath}/my-fines`, icon: '💰', label: 'My Fines',     color: '#fee2e2' },
  ];

  return (
    <div className="page">
      <PageHeader title="Library" subtitle="School library portal" />

      {(bl || fl) ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12, marginBottom: 24 }}>
            <div style={{ background: '#d1fae5', borderRadius: 'var(--radius)', padding: '16px 20px' }}>
              <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Books Issued</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{activeBooks}</div>
            </div>
            <div style={{ background: '#fee2e2', borderRadius: 'var(--radius)', padding: '16px 20px' }}>
              <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Pending Fines</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{pendingFines}</div>
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
        </>
      )}
    </div>
  );
}
