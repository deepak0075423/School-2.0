import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/teacher.api';
import { PageHeader, Table, Button, Spinner, StatCard } from '../../../components/ui/index';

export default function TeacherExamAnalytics() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: exam }    = useFetch(() => api.getExam(id), [id]);
  const { data, loading } = useFetch(() => api.getAnalytics(id), [id]);

  if (loading) return <div className="loading-page"><Spinner /></div>;
  if (!data) return null;

  const qCols = [
    { key: 'q',    label: 'Question', render: (r, i) => <span style={{ fontSize: '.88rem' }}>{r.questionText}</span> },
    { key: 'att',  label: 'Attempted by', render: r => r.attemptedBy },
    { key: 'cor',  label: 'Correct', render: r => r.correctCount },
    { key: 'rate', label: 'Success rate', render: r => {
      const pct = r.attemptedBy ? Math.round((r.correctCount / r.attemptedBy) * 100) : 0;
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 90, height: 8, background: 'var(--bg-secondary)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: pct >= 60 ? 'var(--success, #22c55e)' : pct >= 30 ? 'orange' : 'var(--danger, #ef4444)' }} />
          </div>
          <span style={{ fontSize: '.85rem' }}>{pct}%</span>
        </div>
      );
    }},
  ];

  return (
    <div className="page">
      <PageHeader title={`Analytics — ${exam?.title || ''}`}
        action={<Button variant="secondary" onClick={() => navigate('/teacher/exams')}>← Back</Button>} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard icon="🧑‍🎓" label="Attempts"   value={data.totalStudents} />
        <StatCard icon="✅" label="Submitted"   value={data.submitted} color="green" />
        <StatCard icon="📊" label="Average"     value={`${data.avgScore}/${exam?.totalMarks ?? ''}`} />
        <StatCard icon="🏆" label="Highest"     value={data.highest} color="green" />
        <StatCard icon="📉" label="Lowest"      value={data.lowest} color="red" />
        <StatCard icon="🎯" label="Passed (40%)" value={data.passed} />
      </div>

      <div className="card">
        <div className="card-header"><strong>Question-wise performance</strong></div>
        <div className="card-body" style={{ padding: 0 }}>
          <Table columns={qCols} data={data.questionStats} emptyIcon="📊" emptyTitle="No data" />
        </div>
      </div>
    </div>
  );
}
