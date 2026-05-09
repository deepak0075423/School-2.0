import React from 'react';
import useFetch from '../../hooks/useFetch';
import { getExams } from '../../api/parent.api';
import { PageHeader, Table, Badge, Spinner } from '../../components/ui/index';

export default function ParentExams() {
  const { data: exams, loading } = useFetch(getExams);

  const statusColor = { upcoming: 'info', active: 'success', completed: 'muted', cancelled: 'danger' };

  const columns = [
    { key: 'title',     label: 'Exam',    render: r => <strong>{r.title}</strong> },
    { key: 'subject',   label: 'Subject', render: r => r.subject?.name || '—' },
    { key: 'date',      label: 'Date',    render: r => r.examDate ? new Date(r.examDate).toLocaleDateString() : '—' },
    { key: 'totalMarks',label: 'Marks',   render: r => r.totalMarks || '—' },
    { key: 'status',    label: 'Status',  render: r => <Badge variant={statusColor[r.status] || 'muted'}>{r.status}</Badge> },
  ];

  return (
    <div className="page">
      <PageHeader title="Exams" subtitle="Child's upcoming and past exams" />
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={exams} emptyIcon="📝" emptyTitle="No exams" />}
        </div>
      </div>
    </div>
  );
}
