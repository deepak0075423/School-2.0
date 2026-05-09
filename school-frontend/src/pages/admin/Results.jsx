import React, { useState } from 'react';
import useFetch from '../../hooks/useFetch';
import { getFormalExams, approveFormalExam, rejectFormalExam } from '../../api/admin.api';
import { PageHeader, Table, Badge, Button, Spinner, Pagination } from '../../components/ui/index';
import toast from 'react-hot-toast';

export default function Results() {
  const [tab, setTab] = useState('exams');
  const [page, setPage] = useState(1);
  const { data, loading, refetch } = useFetch(() => getFormalExams(), []);

  const handleApprove = async (id) => {
    try { await approveFormalExam(id); toast.success('Exam approved'); refetch(); }
    catch (err) { toast.error(err.message); }
  };

  const columns = [
    { key: 'title',    label: 'Exam',      render: r => <strong>{r.title || r.name}</strong> },
    { key: 'class',    label: 'Class',     render: r => r.class?.name || '—' },
    { key: 'term',     label: 'Term' },
    { key: 'status',   label: 'Status',    render: r =>
      <Badge variant={r.status === 'approved' ? 'success' : r.status === 'pending' ? 'warning' : 'info'}>
        {r.status || 'draft'}
      </Badge> },
    { key: 'actions',  label: 'Actions',   render: r => (
      <div className="actions">
        {r.status === 'pending' && (
          <>
            <button className="btn btn-success btn-sm" onClick={() => handleApprove(r._id)}>Approve</button>
            <button className="btn btn-danger btn-sm"  onClick={() => rejectFormalExam(r._id).then(refetch)}>Reject</button>
          </>
        )}
      </div>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="Results & Assessments" subtitle="Formal exams and class tests" />

      <div className="tabs">
        {[['exams','Formal Exams'],['class-tests','Class Tests']].map(([key,label]) => (
          <button key={key} className={`tab${tab===key?' active':''}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {tab === 'exams' && (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
              : <Table columns={columns} data={data} emptyIcon="📊" emptyTitle="No exams found" />}
          </div>
        </div>
      )}

      {tab === 'class-tests' && (
        <div className="card"><div className="card-body">
          <p className="text-muted">Class test results submitted by subject teachers appear here for validation.</p>
        </div></div>
      )}
    </div>
  );
}
