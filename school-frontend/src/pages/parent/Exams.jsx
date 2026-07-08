import React from 'react';
import useFetch from '../../hooks/useFetch';
import { getExams } from '../../api/parent.api';
import { PageHeader, Table, Badge, Spinner } from '../../components/ui/index';

export default function ParentExams() {
  const { data: exams, loading } = useFetch(getExams);

  const columns = [
    { key: 'title', label: 'Exam', render: r => (
      <div>
        <strong>{r.title}</strong>
        <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{r.subject?.subjectName || 'General'}</div>
      </div>
    )},
    { key: 'date', label: 'Date', render: r => (
      <div>
        {r.examDate ? new Date(r.examDate).toLocaleDateString('en-IN') : '—'}
        <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{r.startTime} · {r.duration} min</div>
      </div>
    )},
    { key: 'status', label: 'Attempt', render: r => r.attempt
      ? <Badge variant={r.attempt.status === 'auto_submitted' ? 'warning' : 'success'}>
          {r.attempt.status === 'auto_submitted' ? 'auto-submitted' : 'submitted'}
        </Badge>
      : <Badge variant="muted">not attempted</Badge> },
    { key: 'score', label: 'Score', render: r => r.attempt
      ? <strong>{r.attempt.score}/{r.totalMarks}</strong> : '—' },
    { key: 'pct', label: 'Percentage', render: r => r.attempt ? `${r.attempt.percentage}%` : '—' },
    { key: 'outcome', label: 'Outcome', render: r => r.attempt
      ? <Badge variant={r.attempt.passed ? 'success' : 'danger'}>{r.attempt.passed ? 'Passed' : 'Failed'}</Badge>
      : '—' },
  ];

  return (
    <div className="page">
      <PageHeader title="Aptitude Exam Results" subtitle="Your child's published exam results" />
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={exams} emptyIcon="📝" emptyTitle="No published results yet" />}
        </div>
      </div>
    </div>
  );
}
