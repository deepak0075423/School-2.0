import React from 'react';
import useFetch from '../../hooks/useFetch';
import { getResults } from '../../api/parent.api';
import { PageHeader, Table, Badge, Spinner } from '../../components/ui/index';

export default function ParentResults() {
  const { data: results, loading } = useFetch(getResults);

  const columns = [
    { key: 'exam',     label: 'Exam',       render: r => <strong>{r.examTitle || r.title || '—'}</strong> },
    { key: 'subject',  label: 'Subject',    render: r => r.subject?.name || '—' },
    { key: 'marks',    label: 'Marks',      render: r => r.marksObtained !== undefined ? `${r.marksObtained}/${r.totalMarks}` : '—' },
    { key: 'grade',    label: 'Grade',      render: r => r.grade ? <Badge variant="info">{r.grade}</Badge> : '—' },
    { key: 'status',   label: 'Pass/Fail',  render: r => r.passed !== undefined ? <Badge variant={r.passed ? 'success' : 'danger'}>{r.passed ? 'Pass' : 'Fail'}</Badge> : '—' },
  ];

  return (
    <div className="page">
      <PageHeader title="Results" subtitle="Child's exam results" />
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={results} emptyIcon="📊" emptyTitle="No results yet" />}
        </div>
      </div>
    </div>
  );
}
