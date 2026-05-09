import React from 'react';
import useFetch from '../../hooks/useFetch';
import { getHolidays } from '../../api/parent.api';
import { PageHeader, Table, Badge, Spinner } from '../../components/ui/index';

export default function ParentHolidays() {
  const { data: holidays, loading } = useFetch(getHolidays);

  const typeColor = { public: 'success', religious: 'warning', national: 'info', school: 'secondary' };

  const columns = [
    { key: 'name',  label: 'Holiday', render: r => <strong>{r.name}</strong> },
    { key: 'date',  label: 'Date',    render: r => new Date(r.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) },
    { key: 'type',  label: 'Type',    render: r => <Badge variant={typeColor[r.type] || 'muted'}>{r.type}</Badge> },
  ];

  return (
    <div className="page">
      <PageHeader title="Holidays" subtitle="School holiday calendar" />
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={holidays} emptyIcon="🎉" emptyTitle="No holidays" />}
        </div>
      </div>
    </div>
  );
}
