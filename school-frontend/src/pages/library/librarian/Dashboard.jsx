import React from 'react';
import useFetch from '../../../hooks/useFetch';
import { getDashboard } from '../../../api/library.api';
import { PageHeader, StatCard, Spinner } from '../../../components/ui/index';

export default function LibraryDashboard() {
  const { data, loading } = useFetch(getDashboard);

  if (loading) return <div className="loading-page"><Spinner /></div>;

  const stats = [
    { label: 'Total Books',    value: data?.totalBooks    || 0, icon: '📚', color: '#dbeafe' },
    { label: 'Issued Today',   value: data?.issuedToday   || 0, icon: '📤', color: '#d1fae5' },
    { label: 'Overdue',        value: data?.overdue       || 0, icon: '⚠️', color: '#fee2e2' },
    { label: 'Reservations',   value: data?.reservations  || 0, icon: '🔖', color: '#fef3c7' },
  ];

  return (
    <div className="page">
      <PageHeader title="Library Dashboard" subtitle="Library management overview" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16 }}>
        {stats.map(s => <StatCard key={s.label} {...s} />)}
      </div>
    </div>
  );
}
