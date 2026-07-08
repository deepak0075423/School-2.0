import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import { getExamResult } from '../../../api/student.api';
import { PageHeader, Badge, Button, Spinner, StatCard } from '../../../components/ui/index';

export default function StudentExamResult() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, error } = useFetch(() => getExamResult(id), [id]);

  if (loading) return <div className="loading-page"><Spinner /></div>;
  if (error || !data) {
    return (
      <div className="page">
        <div className="card"><div className="card-body" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>⏳</div>
          <h3 style={{ marginBottom: 8 }}>Result not available</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>{error || 'Results are not published yet.'}</p>
          <Button variant="secondary" onClick={() => navigate('/student/exams')}>← Back to exams</Button>
        </div></div>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader title={`Result — ${data.exam?.title}`}
        subtitle={data.submittedAt ? `Submitted ${new Date(data.submittedAt).toLocaleString('en-IN')}` : ''}
        action={<Button variant="secondary" onClick={() => navigate('/student/exams')}>← Back</Button>} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard icon="🎯" label="Score"      value={`${data.score}/${data.exam?.totalMarks}`} />
        <StatCard icon="📊" label="Percentage" value={`${data.percentage}%`} />
        <StatCard icon={data.passed ? '✅' : '❌'} label="Outcome" value={data.passed ? 'Passed' : 'Failed'} color={data.passed ? 'green' : 'red'} />
      </div>

      {(data.questions || []).map((q, i) => (
        <div key={q._id} className="card" style={{ marginBottom: 12 }}>
          <div className="card-body">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <strong>Q{i + 1}.</strong>
              <Badge variant={q.selected?.length === 0 ? 'muted' : q.isCorrect ? 'success' : 'danger'}>
                {q.selected?.length === 0 ? 'Unanswered' : q.isCorrect ? `Correct +${q.earnedMarks}` : 'Incorrect'}
              </Badge>
              <Badge variant="muted">{q.marks} mark{q.marks !== 1 ? 's' : ''}</Badge>
            </div>
            <div style={{ marginBottom: 10, whiteSpace: 'pre-wrap' }}>{q.questionText}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
              {(q.options || []).map(o => {
                const isSel = (q.selected || []).includes(o.optionId);
                const isCor = (q.correctAnswers || []).includes(o.optionId);
                return (
                  <div key={o.optionId} style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: '.88rem',
                    border: `1px solid ${isCor ? 'var(--success, #22c55e)' : isSel ? 'var(--danger, #ef4444)' : 'var(--border)'}`,
                    background: isCor ? 'rgba(34,197,94,.08)' : isSel ? 'rgba(239,68,68,.06)' : 'transparent',
                  }}>
                    <strong style={{ textTransform: 'uppercase' }}>{o.optionId}.</strong> {o.text}
                    {isCor && ' ✓'}{isSel && !isCor && ' ✗ (your answer)'}{isSel && isCor && ' (your answer)'}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
