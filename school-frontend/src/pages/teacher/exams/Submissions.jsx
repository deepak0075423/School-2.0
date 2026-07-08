import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/teacher.api';
import { PageHeader, Table, Badge, Button, Spinner } from '../../../components/ui/index';

const STATUS = {
  not_started:    { label: 'Not started',    variant: 'muted' },
  in_progress:    { label: 'In progress',    variant: 'warning' },
  submitted:      { label: 'Submitted',      variant: 'success' },
  auto_submitted: { label: 'Auto-submitted', variant: 'danger' },
};

export default function TeacherExamSubmissions() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: exam } = useFetch(() => api.getExam(id), [id]);
  const { data, loading } = useFetch(() => api.getSubmissions(id), [id]);

  const rows = data || [];

  const columns = [
    { key: 'student', label: 'Student', render: r => (
      <div>
        <strong>{r.student?.name || '—'}</strong>
        <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{r.student?.email || ''}</div>
      </div>
    )},
    { key: 'status', label: 'Status', render: r => {
      const s = STATUS[r.status] || STATUS.not_started;
      return <Badge variant={s.variant}>{s.label}</Badge>;
    }},
    { key: 'started',   label: 'Started',   render: r => r.startedAt   ? new Date(r.startedAt).toLocaleString('en-IN')   : '—' },
    { key: 'submitted', label: 'Submitted', render: r => r.submittedAt ? new Date(r.submittedAt).toLocaleString('en-IN') : '—' },
    { key: 'violations', label: 'Violations', render: r => r.violationCount > 0
      ? <Badge variant="danger">{r.violationCount}</Badge> : '0' },
    { key: 'score', label: 'Score', render: r => r.score !== null && r.score !== undefined
      ? <strong>{r.score}/{exam?.totalMarks}</strong> : '—' },
    { key: 'actions', label: '', render: r => (
      ['submitted', 'auto_submitted'].includes(r.status) && r.student?._id ? (
        <button className="btn btn-secondary btn-sm"
          onClick={() => navigate(`/teacher/exams/${id}/submissions/${r.student._id}`)}>
          View answers
        </button>
      ) : null
    )},
  ];

  if (loading) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page">
      <PageHeader title={`Submissions — ${exam?.title || ''}`}
        subtitle={`${rows.filter(r => ['submitted','auto_submitted'].includes(r.status)).length}/${rows.length} submitted`}
        action={<Button variant="secondary" onClick={() => navigate('/teacher/exams')}>← Back</Button>} />
      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} emptyIcon="🧑‍🎓" emptyTitle="No attempts yet" />
      </div></div>
    </div>
  );
}
