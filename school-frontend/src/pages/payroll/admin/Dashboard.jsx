import React from 'react';
import useFetch from '../../../hooks/useFetch';
import { getDashboard } from '../../../api/payroll.api';
import { PageHeader, StatCard, Spinner } from '../../../components/ui/index';

export default function PayrollAdminDashboard() {
  const { data, loading } = useFetch(getDashboard);

  if (loading) return <div className="loading-page"><Spinner /></div>;

  const d = data?.data || {};
  const stats = [
    { label: 'Total Employees',    value: d.totalEmployees || 0,                                                          icon: '👥', color: '#dbeafe' },
    { label: 'Active Assignments', value: d.activeAssignments || 0,                                                       icon: '📋', color: '#d1fae5' },
    { label: 'Current Run',        value: d.currentRun ? `${d.currentRun.month}/${d.currentRun.year}` : 'None',           icon: '⚙️', color: '#fef3c7' },
    { label: 'Recent Runs',        value: Array.isArray(d.recentRuns) ? d.recentRuns.length : 0,                          icon: '📄', color: '#ede9fe' },
  ];

  return (
    <div className="page">
      <PageHeader title="Payroll Dashboard" subtitle="Payroll overview" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16 }}>
        {stats.map(s => <StatCard key={s.label} {...s} />)}
      </div>
    </div>
  );
}
