import React from 'react';
import { useNavigate } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import { getExams } from '../../api/student.api';
import { PageHeader, Table, Badge, Button, Spinner } from '../../components/ui/index';

const STATUS_COLOR = { upcoming: 'info', active: 'success', completed: 'muted', expired: 'danger' };

export default function StudentExams() {
  const navigate = useNavigate();
  const { data: exams, loading } = useFetch(getExams);

  const getStatus = (exam) => {
    if (exam.submitted) return 'completed';
    const now = new Date();
    if (exam.startTime && now < new Date(exam.startTime)) return 'upcoming';
    if (exam.endTime   && now > new Date(exam.endTime))   return 'expired';
    return 'active';
  };

  const columns = [
    { key: 'title',    label: 'Exam',      render: r => <strong>{r.title}</strong> },
    { key: 'duration', label: 'Duration',  render: r => `${r.duration} min` },
    { key: 'status',   label: 'Status',    render: r => <Badge variant={STATUS_COLOR[getStatus(r)]}>{getStatus(r)}</Badge> },
    { key: 'actions',  label: '',          render: r => {
      const s = getStatus(r);
      if (s === 'active')    return <Button size="sm" onClick={() => navigate(`/student/exams/${r._id}/attempt`)}>Start Exam</Button>;
      if (s === 'completed') return <Button size="sm" variant="secondary">View Result</Button>;
      return null;
    }},
  ];

  if (loading) return <div className="loading-page"><Spinner /></div>;
  return (
    <div className="page">
      <PageHeader title="Exams" subtitle="Available aptitude exams" />
      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={exams} emptyIcon="📝" emptyTitle="No exams available" />
      </div></div>
    </div>
  );
}
