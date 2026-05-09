import React from 'react';
import useFetch from '../../hooks/useFetch';
import { getDashboard } from '../../api/admin.api';
import { PageHeader, StatCard, Spinner } from '../../components/ui/index';

export default function Reports() {
  const { data, loading } = useFetch(getDashboard);
  if (loading) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page">
      <PageHeader title="Reports" subtitle="School analytics and insights" />
      <div className="stat-grid">
        <StatCard icon="👨‍🏫" label="Total Teachers"  value={data?.teachers} color="blue" />
        <StatCard icon="👨‍🎓" label="Total Students"  value={data?.students} color="green" />
        <StatCard icon="👨‍👩‍👧" label="Total Parents"   value={data?.parents}  color="orange" />
      </div>
      <div className="alert alert-info">
        📈 Detailed reports (attendance, fees collection, exam results) are available in their respective modules.
      </div>
    </div>
  );
}
