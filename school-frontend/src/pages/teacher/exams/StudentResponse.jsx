import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/teacher.api';
import { PageHeader, Badge, Button, Spinner } from '../../../components/ui/index';

export default function TeacherStudentResponse() {
  const { id, studentId } = useParams();
  const navigate = useNavigate();
  const { data, loading } = useFetch(() => api.getStudentResponse(id, studentId), [id, studentId]);

  if (loading) return <div className="loading-page"><Spinner /></div>;
  if (!data) return null;

  const { attempt, questions, score, totalMarks } = data;
  const ansMap = Object.fromEntries((attempt?.answers || []).map(a => [String(a.question), a.selectedOptions || []]));

  return (
    <div className="page">
      <PageHeader title="Student Response"
        subtitle={`Score: ${score}/${totalMarks} · ${attempt?.violationCount || 0} violation(s) · ${attempt?.status}`}
        action={<Button variant="secondary" onClick={() => navigate(`/teacher/exams/${id}/submissions`)}>← Back</Button>} />

      {(questions || []).map((q, i) => {
        const selected  = ansMap[String(q._id)] || [];
        const correct   = q.correctAnswers || [];
        const isCorrect = selected.length === correct.length &&
          correct.every(c => selected.includes(c)) && selected.every(s => correct.includes(s));
        return (
          <div key={q._id} className="card" style={{ marginBottom: 12 }}>
            <div className="card-body">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                <strong>Q{i + 1}.</strong>
                <Badge variant={selected.length === 0 ? 'muted' : isCorrect ? 'success' : 'danger'}>
                  {selected.length === 0 ? 'Unanswered' : isCorrect ? `Correct +${q.marks}` : 'Incorrect'}
                </Badge>
              </div>
              <div style={{ marginBottom: 10, whiteSpace: 'pre-wrap' }}>{q.questionText}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
                {(q.options || []).map(o => {
                  const isSel = selected.includes(o.optionId);
                  const isCor = correct.includes(o.optionId);
                  return (
                    <div key={o.optionId} style={{
                      padding: '6px 12px', borderRadius: 8, fontSize: '.88rem',
                      border: `1px solid ${isCor ? 'var(--success, #22c55e)' : isSel ? 'var(--danger, #ef4444)' : 'var(--border)'}`,
                      background: isCor ? 'rgba(34,197,94,.08)' : isSel ? 'rgba(239,68,68,.06)' : 'transparent',
                    }}>
                      <strong style={{ textTransform: 'uppercase' }}>{o.optionId}.</strong> {o.text}
                      {isCor && ' ✓'}{isSel && !isCor && ' ✗ (chosen)'}{isSel && isCor && ' (chosen)'}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
