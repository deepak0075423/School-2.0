import React from 'react';
import { useNavigate } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import { getExams } from '../../../api/student.api';
import { PageHeader, Table, Badge, Button, Spinner } from '../../../components/ui/index';

export default function StudentExamsList() {
  const navigate = useNavigate();
  const { data: exams, loading } = useFetch(getExams);

  const statusOf = (exam) => {
    if (exam.attempt && ['submitted', 'auto_submitted'].includes(exam.attempt.status)) return 'submitted';
    if (exam.canAttempt) return 'active';
    const start = exam.examDate
      ? new Date(`${String(exam.examDate).slice(0, 10)}T${exam.startTime || '00:00'}:00`)
      : null;
    if (start && new Date() < start) return 'upcoming';
    return 'expired';
  };

  const COLOR = { upcoming: 'info', active: 'success', submitted: 'muted', expired: 'danger' };

  const columns = [
    { key: 'title', label: 'Exam', render: r => (
      <div>
        <strong>{r.title}</strong>
        <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
          {r.subject?.subjectName || 'General'}
        </div>
      </div>
    )},
    { key: 'date', label: 'Scheduled', render: r => (
      <div>
        {r.examDate ? new Date(r.examDate).toLocaleDateString('en-IN') : '—'}
        <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{r.startTime} · {r.duration} min</div>
      </div>
    )},
    { key: 'marks',  label: 'Marks',  render: r => r.totalMarks },
    { key: 'status', label: 'Status', render: r => {
      const s = statusOf(r);
      return <Badge variant={COLOR[s]}>{s}</Badge>;
    }},
    { key: 'actions', label: '', render: r => {
      const s = statusOf(r);
      if (s === 'active') {
        return <Button size="sm" onClick={() => navigate(`/student/exams/${r._id}/attempt`)}>
          {r.attempt?.status === 'in_progress' ? 'Resume Exam' : 'Start Exam'}
        </Button>;
      }
      if (s === 'submitted' && r.resultApprovalStatus === 'approved') {
        return <Button size="sm" variant="secondary" onClick={() => navigate(`/student/exams/${r._id}/result`)}>View Result</Button>;
      }
      if (s === 'submitted') return <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Result pending</span>;
      return null;
    }},
  ];

  if (loading) return <div className="loading-page"><Spinner /></div>;
  return (
    <div className="page">
      <PageHeader title="Aptitude Exams" subtitle="Exams scheduled for your section" />
      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={exams} emptyIcon="📝" emptyTitle="No exams available" />
      </div></div>
    </div>
  );
}
