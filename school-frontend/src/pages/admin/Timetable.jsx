import React from 'react';
import { PageHeader, Spinner } from '../../components/ui/index';
import useFetch from '../../hooks/useFetch';
import { getClasses } from '../../api/admin.api';
import { Link } from 'react-router-dom';

export default function Timetable() {
  const { data: classes, loading } = useFetch(getClasses);
  if (loading) return <div className="loading-page"><Spinner /></div>;
  return (
    <div className="page">
      <PageHeader title="Timetable" subtitle="Select a class to manage its timetable" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16 }}>
        {(classes||[]).map(cls => (
          <Link key={cls._id} to={`/admin/classes/${cls._id}`}
            style={{ display: 'block', background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', padding: 20, textDecoration: 'none', color: 'inherit',
              transition: 'box-shadow .2s' }}
            onMouseEnter={e=>e.currentTarget.style.boxShadow='var(--shadow)'}
            onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>🕐</div>
            <div style={{ fontWeight: 600 }}>{cls.name}</div>
            <div style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>View sections & timetable</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
