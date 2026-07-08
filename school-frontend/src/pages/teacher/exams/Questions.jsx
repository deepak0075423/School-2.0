import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/teacher.api';
import { PageHeader, Badge, Button, Modal, Confirm, Spinner, Empty } from '../../../components/ui/index';

const DEFAULT_OPTIONS = [
  { optionId: 'a', text: '' },
  { optionId: 'b', text: '' },
  { optionId: 'c', text: '' },
  { optionId: 'd', text: '' },
];
const TF_OPTIONS = [
  { optionId: 'true',  text: 'True' },
  { optionId: 'false', text: 'False' },
];
const EMPTY_Q = { questionText: '', questionType: 'mcq_single', options: DEFAULT_OPTIONS, correctAnswers: [], marks: 1 };

export default function TeacherExamQuestions() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: exam }                       = useFetch(() => api.getExam(id), [id]);
  const { data: questions, loading, refetch } = useFetch(() => api.getQuestions(id), [id]);

  const [modal, setModal]     = useState(false);
  const [editing, setEditing] = useState(null);
  const [del, setDel]         = useState(null);
  const [saving, setSaving]   = useState(false);
  const [form, setForm]       = useState(EMPTY_Q);

  const isDraft = exam?.status === 'draft';

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY_Q, options: DEFAULT_OPTIONS.map(o => ({ ...o })) }); setModal(true); };
  const openEdit = (q) => {
    setEditing(q);
    setForm({
      questionText:   q.questionText,
      questionType:   q.questionType,
      options:        (q.options || []).map(o => ({ ...o })),
      correctAnswers: [...(q.correctAnswers || [])],
      marks:          q.marks,
    });
    setModal(true);
  };

  const setType = (t) => {
    setForm(f => ({
      ...f, questionType: t, correctAnswers: [],
      options: t === 'true_false' ? TF_OPTIONS.map(o => ({ ...o })) : DEFAULT_OPTIONS.map(o => ({ ...o })),
    }));
  };

  const toggleCorrect = (optionId) => {
    setForm(f => {
      if (f.questionType === 'mcq_multiple') {
        const has = f.correctAnswers.includes(optionId);
        return { ...f, correctAnswers: has ? f.correctAnswers.filter(x => x !== optionId) : [...f.correctAnswers, optionId] };
      }
      return { ...f, correctAnswers: [optionId] };
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.correctAnswers.length) return toast.error('Mark at least one correct answer');
    if (form.questionType !== 'true_false' && form.options.some(o => !o.text.trim()))
      return toast.error('All options need text');
    setSaving(true);
    try {
      if (editing) {
        await api.updateQuestion(id, editing._id, form);
        toast.success('Question updated');
      } else {
        await api.addQuestion(id, form);
        toast.success('Question added');
      }
      setModal(false);
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    try { await api.deleteQuestion(id, del._id); toast.success('Deleted'); setDel(null); refetch(); }
    catch (err) { toast.error(err.message); }
  };

  if (loading) return <div className="loading-page"><Spinner /></div>;
  const qs = questions || [];

  return (
    <div className="page">
      <PageHeader
        title={`Questions — ${exam?.title || ''}`}
        subtitle={`${qs.length}/${exam?.totalQuestions || '?'} questions · ${qs.reduce((s, q) => s + (q.marks || 0), 0)} marks assigned of ${exam?.totalMarks || '?'}`}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={() => navigate('/teacher/exams')}>← Back</Button>
            {isDraft && <Button onClick={openCreate}>+ Add Question</Button>}
          </div>
        } />

      {!isDraft && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-body" style={{ color: 'var(--text-muted)' }}>
            🔒 This exam is {exam?.status} — questions are read-only.
          </div>
        </div>
      )}

      {qs.length === 0 ? (
        <div className="card"><div className="card-body">
          <Empty icon="❓" title="No questions yet" message={isDraft ? 'Add your first question to get started.' : ''} />
        </div></div>
      ) : qs.map((q, i) => (
        <div key={q._id} className="card" style={{ marginBottom: 12 }}>
          <div className="card-body">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                  <strong>Q{i + 1}.</strong>
                  <Badge variant="info">{q.questionType === 'mcq_single' ? 'Single choice' : q.questionType === 'mcq_multiple' ? 'Multiple choice' : 'True / False'}</Badge>
                  <Badge variant="muted">{q.marks} mark{q.marks !== 1 ? 's' : ''}</Badge>
                </div>
                <div style={{ marginBottom: 10, whiteSpace: 'pre-wrap' }}>{q.questionText}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
                  {(q.options || []).map(o => {
                    const correct = (q.correctAnswers || []).includes(o.optionId);
                    return (
                      <div key={o.optionId} style={{
                        padding: '6px 12px', borderRadius: 8, fontSize: '.88rem',
                        border: `1px solid ${correct ? 'var(--success, #22c55e)' : 'var(--border)'}`,
                        background: correct ? 'rgba(34,197,94,.08)' : 'transparent',
                      }}>
                        <strong style={{ textTransform: 'uppercase' }}>{o.optionId}.</strong> {o.text} {correct && '✓'}
                      </div>
                    );
                  })}
                </div>
              </div>
              {isDraft && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(q)}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => setDel(q)}>Delete</button>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Question' : 'Add Question'} maxWidth={640}
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="q-form" type="submit" loading={saving}>{editing ? 'Save' : 'Add'}</Button>
        </>}>
        <form id="q-form" onSubmit={handleSave}>
          <div className="form-group">
            <label className="form-label required">Question</label>
            <textarea className="form-control" rows={3} required value={form.questionText}
              onChange={e => setForm(f => ({ ...f, questionText: e.target.value }))} />
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-control" value={form.questionType} onChange={e => setType(e.target.value)}>
                <option value="mcq_single">Single choice</option>
                <option value="mcq_multiple">Multiple choice</option>
                <option value="true_false">True / False</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label required">Marks</label>
              <input type="number" min="0.5" step="0.5" className="form-control" required value={form.marks}
                onChange={e => setForm(f => ({ ...f, marks: +e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Options — tick the correct answer{form.questionType === 'mcq_multiple' ? 's' : ''}</label>
            {form.options.map((o, idx) => (
              <div key={o.optionId} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <input
                  type={form.questionType === 'mcq_multiple' ? 'checkbox' : 'radio'}
                  name="correct"
                  checked={form.correctAnswers.includes(o.optionId)}
                  onChange={() => toggleCorrect(o.optionId)}
                />
                <strong style={{ width: 40, textTransform: 'uppercase' }}>{o.optionId}.</strong>
                {form.questionType === 'true_false' ? (
                  <span>{o.text}</span>
                ) : (
                  <input className="form-control" placeholder={`Option ${o.optionId.toUpperCase()}`} value={o.text}
                    onChange={e => setForm(f => {
                      const options = [...f.options];
                      options[idx] = { ...options[idx], text: e.target.value };
                      return { ...f, options };
                    })} />
                )}
              </div>
            ))}
          </div>
        </form>
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={handleDelete}
        title="Delete Question" message="Delete this question?" />
    </div>
  );
}
