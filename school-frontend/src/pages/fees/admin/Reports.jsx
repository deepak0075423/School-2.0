import React, { useState } from 'react';
import useFetch from '../../../hooks/useFetch';
import { getCollectionReport, getDuesReport } from '../../../api/fees.api';
import { PageHeader, Table, Spinner } from '../../../components/ui/index';

export default function FeesReports() {
  const [tab, setTab] = useState('collection');

  const { data: collection, loading: cl } = useFetch(getCollectionReport);
  const { data: dues,       loading: dl } = useFetch(getDuesReport);

  const collectionCols = [
    { key: 'student', label: 'Student',   render: r => r.student?.name || '—' },
    { key: 'amount',  label: 'Collected', render: r => `₹${(r.amount||0).toLocaleString()}` },
    { key: 'date',    label: 'Date',      render: r => new Date(r.createdAt).toLocaleDateString() },
    { key: 'mode',    label: 'Mode',      render: r => r.mode || '—' },
  ];

  const duesCols = [
    { key: 'student', label: 'Student',   render: r => r.student?.name || '—' },
    { key: 'class',   label: 'Class',     render: r => r.student?.class?.name || '—' },
    { key: 'due',     label: 'Due (₹)',   render: r => `₹${(r.dueAmount||0).toLocaleString()}` },
    { key: 'fine',    label: 'Fine (₹)',  render: r => `₹${(r.fine||0).toLocaleString()}` },
  ];

  return (
    <div className="page">
      <PageHeader title="Fee Reports" subtitle="Collection and dues reports" />
      <div className="tabs" style={{ marginBottom: 20 }}>
        {[['collection','Collection'],['dues','Dues']].map(([key,label]) => (
          <button key={key} className={`tab${tab===key?' active':''}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {tab === 'collection' && (cl ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={collectionCols} data={collection} emptyIcon="📊" emptyTitle="No collection data" />)}
          {tab === 'dues' && (dl ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={duesCols} data={dues} emptyIcon="📊" emptyTitle="No dues data" />)}
        </div>
      </div>
    </div>
  );
}
