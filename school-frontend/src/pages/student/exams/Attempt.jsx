import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/student.api';
import { Spinner, Button, Confirm, Badge } from '../../../components/ui/index';

function fmtClock(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return (h ? `${String(h).padStart(2, '0')}:` : '') + `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function StudentExamAttempt() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [answers, setAnswers] = useState({});      // questionId → [optionIds]
  const [current, setCurrent] = useState(0);
  const [remaining, setRemaining] = useState(null);
  const [violations, setViolations] = useState(0);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submittedRef = useRef(false);
  const savingRef    = useRef({});

  // ── Load attempt ──────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await api.getAttempt(id);
        const d = res.data;
        setData(d);
        setViolations(d.violationCount || 0);
        const saved = {};
        (d.savedAnswers || []).forEach(a => { saved[String(a.question)] = a.selectedOptions || []; });
        setAnswers(saved);
      } catch (err) {
        setError(err.message || 'Could not load exam');
      } finally { setLoading(false); }
    })();
  }, [id]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const doSubmit = useCallback(async (auto = false) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      await api.submitExam(id);
      toast.success(auto ? 'Time up — exam auto-submitted' : 'Exam submitted successfully');
    } catch (err) {
      // Already auto-submitted server-side is fine — anything else, surface it
      if (!/no active attempt/i.test(err.message || '')) toast.error(err.message);
    } finally {
      navigate('/student/exams', { replace: true });
    }
  }, [id, navigate]);

  // ── Timer ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!data?.serverEndTime) return;
    const end = new Date(data.serverEndTime).getTime();
    const tick = () => {
      const left = end - Date.now();
      setRemaining(left);
      if (left <= 0) doSubmit(true);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [data?.serverEndTime, doSubmit]);

  // ── Anti-cheat: tab switch / blur ─────────────────────────────────────────
  useEffect(() => {
    if (!data) return;
    const report = async () => {
      if (submittedRef.current || document.visibilityState === 'visible') return;
      try {
        const res = await api.logViolation(id);
        setViolations(res.violationCount ?? 0);
        if (res.autoSubmitted) {
          submittedRef.current = true;
          toast.error('Too many violations — exam auto-submitted');
          navigate('/student/exams', { replace: true });
        } else {
          toast.error(`⚠️ Tab switch detected! Violation ${res.violationCount}/${data.exam.maxViolations}`, { duration: 5000 });
        }
      } catch { /* attempt may already be closed */ }
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') report(); };
    document.addEventListener('visibilitychange', onVisibility);
    const onContext = (e) => e.preventDefault();
    document.addEventListener('contextmenu', onContext);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('contextmenu', onContext);
    };
  }, [data, id, navigate]);

  // ── Answer selection (saves immediately) ──────────────────────────────────
  const select = async (q, optionId) => {
    const qid = String(q._id);
    let next;
    if (q.questionType === 'mcq_multiple') {
      const cur = answers[qid] || [];
      next = cur.includes(optionId) ? cur.filter(x => x !== optionId) : [...cur, optionId];
    } else {
      next = [optionId];
    }
    setAnswers(a => ({ ...a, [qid]: next }));
    savingRef.current[qid] = true;
    try {
      await api.saveAnswer(id, { questionId: qid, selectedOptions: next });
    } catch (err) {
      if (/auto submitted|time ended/i.test(err.message || '')) {
        toast.error('Time is up — exam submitted');
        navigate('/student/exams', { replace: true });
      } else {
        toast.error('Could not save answer — check your connection');
      }
    } finally { savingRef.current[qid] = false; }
  };

  // ── Render states ─────────────────────────────────────────────────────────
  if (loading) return <div className="loading-page"><Spinner /></div>;
  if (error) {
    return (
      <div className="page">
        <div className="card"><div className="card-body" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🚫</div>
          <h3 style={{ marginBottom: 8 }}>Cannot start exam</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>{error}</p>
          <Button variant="secondary" onClick={() => navigate('/student/exams')}>← Back to exams</Button>
        </div></div>
      </div>
    );
  }
  if (!data) return null;

  const { exam, questions } = data;
  const q = questions[current];
  const answeredCount = questions.filter(x => (answers[String(x._id)] || []).length > 0).length;
  const lowTime = remaining !== null && remaining < 5 * 60 * 1000;

  return (
    <div className="page" style={{ userSelect: 'none' }}>
      {/* Sticky header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-primary)',
        borderBottom: '1px solid var(--border)', padding: '10px 4px', marginBottom: 16,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
      }}>
        <div>
          <strong>{exam.title}</strong>
          <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
            {answeredCount}/{questions.length} answered · {exam.totalMarks} marks
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {violations > 0 && (
            <Badge variant="danger">⚠ {violations}/{exam.maxViolations} violations</Badge>
          )}
          <div style={{
            fontVariantNumeric: 'tabular-nums', fontWeight: 800, fontSize: '1.15rem',
            color: lowTime ? 'var(--danger, #ef4444)' : 'inherit',
            padding: '4px 12px', border: '1px solid var(--border)', borderRadius: 8,
          }}>
            ⏱ {remaining === null ? '—' : fmtClock(remaining)}
          </div>
          <Button variant="danger" onClick={() => setConfirmSubmit(true)} loading={submitting}>Submit Exam</Button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Question card */}
        <div className="card" style={{ flex: '1 1 480px' }}>
          <div className="card-body">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <strong>Question {current + 1} of {questions.length}</strong>
              <Badge variant="muted">{q.marks} mark{q.marks !== 1 ? 's' : ''} · {
                q.questionType === 'mcq_single' ? 'single choice' : q.questionType === 'mcq_multiple' ? 'multiple choice' : 'true / false'
              }</Badge>
            </div>
            <div style={{ fontSize: '1.02rem', marginBottom: 18, whiteSpace: 'pre-wrap' }}>{q.questionText}</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(q.options || []).map(o => {
                const sel = (answers[String(q._id)] || []).includes(o.optionId);
                return (
                  <label key={o.optionId} style={{
                    display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer',
                    padding: '10px 14px', borderRadius: 10,
                    border: `2px solid ${sel ? 'var(--primary)' : 'var(--border)'}`,
                    background: sel ? 'rgba(59,130,246,.06)' : 'transparent',
                  }}>
                    <input
                      type={q.questionType === 'mcq_multiple' ? 'checkbox' : 'radio'}
                      name={`q-${q._id}`}
                      checked={sel}
                      onChange={() => select(q, o.optionId)}
                    />
                    <span><strong style={{ textTransform: 'uppercase' }}>{o.optionId}.</strong> {o.text}</span>
                  </label>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
              <Button variant="secondary" disabled={current === 0} onClick={() => setCurrent(c => c - 1)}>← Previous</Button>
              <Button variant="secondary" disabled={current === questions.length - 1} onClick={() => setCurrent(c => c + 1)}>Next →</Button>
            </div>
          </div>
        </div>

        {/* Palette */}
        <div className="card" style={{ width: 230, flexShrink: 0 }}>
          <div className="card-body">
            <strong style={{ fontSize: '.88rem' }}>Questions</strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginTop: 10 }}>
              {questions.map((x, i) => {
                const done = (answers[String(x._id)] || []).length > 0;
                const isCur = i === current;
                return (
                  <button key={x._id} onClick={() => setCurrent(i)} style={{
                    height: 34, borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '.8rem',
                    border: `2px solid ${isCur ? 'var(--primary)' : done ? 'var(--success, #22c55e)' : 'var(--border)'}`,
                    background: done ? 'rgba(34,197,94,.15)' : 'transparent',
                    color: 'inherit',
                  }}>{i + 1}</button>
                );
              })}
            </div>
            <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 12, lineHeight: 1.8 }}>
              <div><span style={{ color: 'var(--success, #22c55e)' }}>■</span> Answered</div>
              <div><span style={{ color: 'var(--primary)' }}>■</span> Current</div>
              <div>⚠️ Switching tabs is recorded as a violation. {exam.maxViolations} violations auto-submit your exam.</div>
            </div>
          </div>
        </div>
      </div>

      <Confirm open={confirmSubmit} onClose={() => setConfirmSubmit(false)}
        onConfirm={() => { setConfirmSubmit(false); doSubmit(false); }}
        title="Submit Exam"
        message={`You answered ${answeredCount} of ${questions.length} questions. Submit now? You cannot change answers afterwards.`} />
    </div>
  );
}
