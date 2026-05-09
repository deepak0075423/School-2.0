import React from 'react';
import useFetch from '../../../hooks/useFetch';
import { getDashboard } from '../../../api/payroll.api';
import { PageHeader, StatCard, Spinner } from '../../../components/ui/index';

export default function PayrollAdminDashboard() {
  const { data, loading } = useFetch(getDashboard);

  if (loading) return <div className="loading-page"><Spinner /></div>;

  const stats = [
    { label: 'Total Employees',   value: data?.totalEmployees || 0,                               icon: '👥', color: '#dbeafe' },
    { label: 'This Month Payout', value: `₹${((data?.thisMonthPayout)||0).toLocaleString()}`,     icon: '💰', color: '#d1fae5' },
    { label: 'Pending Runs',      value: data?.pendingRuns || 0,                                  icon: '⏳', color: '#fef3c7' },
    { label: 'Payslips Issued',   value: data?.payslipsIssued || 0,                               icon: '📄', color: '#ede9fe' },
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
