import React, { useState } from 'react';
import useFetch from '../../hooks/useFetch';
import { getMarksEntry, getClassTests } from '../../api/teacher.api';
import { PageHeader, Table, Button, Badge, Spinner } from '../../components/ui/index';

export default function TeacherResults() {
  const [tab, setTab] = useState('marks-entry');
  const { data: marksExams, loading: ml } = useFetch(getMarksEntry);
  const { data: classTests, loading: cl } = useFetch(getClassTests);

  const marksColumns = [
    { key: 'title',   label: 'Exam',    render: r => <strong>{r.title || r.examTitle}</strong> },
    { key: 'subject', label: 'Subject', render: r => r.subject?.name || '—' },
    { key: 'status',  label: 'Status',  render: r =>
      <Badge variant={r.marksEntered ? 'success' : 'warning'}>{r.marksEntered ? 'Entered' : 'Pending'}</Badge> },
    { key: 'actions', label: '', render: r => (
      <Button size="sm" variant={r.marksEntered ? 'secondary' : 'primary'}>
        {r.marksEntered ? 'Edit Marks' : 'Enter Marks'}
      </Button>
    )},
  ];

  const testColumns = [
    { key: 'title',   label: 'Test',    render: r => <strong>{r.title}</strong> },
    { key: 'date',    label: 'Date',    render: r => r.date ? new Date(r.date).toLocaleDateString() : '—' },
    { key: 'maxMarks',label: 'Max',     render: r => r.maxMarks },
    { key: 'status',  label: 'Status',  render: r =>
      <Badge variant={r.status === 'approved' ? 'success' : 'warning'}>{r.status || 'draft'}</Badge> },
  ];

  return (
    <div className="page">
      <PageHeader title="Results & Marks" subtitle="Enter and manage marks" />

      <div className="tabs">
        {[['marks-entry','Marks Entry'],['class-tests','Class Tests'],['validation','Validation']].map(([k,l]) => (
          <button key={k} className={`tab${tab===k?' active':''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'marks-entry' && (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {ml ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
              : <Table columns={marksColumns} data={marksExams} emptyIcon="📊" emptyTitle="No marks entry pending" />}
          </div>
        </div>
      )}

      {tab === 'class-tests' && (
        <div className="card">
          <div className="card-header">
            <span />
            <Button size="sm">+ Create Test</Button>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {cl ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
              : <Table columns={testColumns} data={classTests} emptyIcon="📝" emptyTitle="No class tests" />}
          </div>
        </div>
      )}

      {tab === 'validation' && (
        <div className="card"><div className="card-body">
          <p className="text-muted">Results submitted by other subject teachers appear here for your validation as class teacher.</p>
        </div></div>
      )}
    </div>
  );
}
