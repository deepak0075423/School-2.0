import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/teacher.api';
import { PageHeader, Table, Badge, Button, Modal, Confirm, Spinner } from '../../../components/ui/index';

const STATUS_COLOR = { draft: 'muted', published: 'success', completed: 'info', cancelled: 'danger' };

const EMPTY_FORM = {
  title: '', sectionId: '', subjectId: '', examDate: '', startTime: '10:00',
  duration: 60, totalQuestions: 10, totalMarks: 100, maxViolations: 3,
};

export default function TeacherExamsList() {
  const navigate = useNavigate();
  const { data: exams, loading, refetch } = useFetch(api.getExams);
  const { data: meta } = useFetch(api.getExamMeta);

  const [modal, setModal]     = useState(false);
  const [editing, setEditing] = useState(null);
  const [del, setDel]         = useState(null);
  const [saving, setSaving]   = useState(false);
  const [delLoad, setDL]      = useState(false);
  const [form, setForm]       = useState(EMPTY_FORM);

  const sections = meta?.sections || [];
  const subjects = meta?.subjects || [];

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setModal(true); };
  const openEdit = (exam) => {
    setEditing(exam);
    setForm({
      title:          exam.title,
      sectionId:      exam.section?._id || exam.section || '',
      subjectId:      exam.subject?._id || exam.subject || '',
      examDate:       exam.examDate ? new Date(exam.examDate).toISOString().slice(0, 10) : '',
      startTime:      exam.startTime || '10:00',
      duration:       exam.duration,
      totalQuestions: exam.totalQuestions,
      totalMarks:     exam.totalMarks,
      maxViolations:  exam.maxViolations || 3,
    });
    setModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.updateExam(editing._id, form);
        toast.success('Exam updated');
      } else {
        await api.createExam(form);
        toast.success('Exam created — now add questions');
      }
      setModal(false);
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handlePublish = async (exam) => {
    if ((exam.questionCount || 0) < exam.totalQuestions) {
      return toast.error(`Add ${exam.totalQuestions - (exam.questionCount || 0)} more question(s) before publishing`);
    }
    try { await api.publishExam(exam._id); toast.success('Exam published'); refetch(); }
    catch (err) { toast.error(err.message); }
  };

  const handleDelete = async () => {
    setDL(true);
    try { await api.deleteExam(del._id); toast.success('Deleted'); setDel(null); refetch(); }
    catch (err) { toast.error(err.message); }
    finally { setDL(false); }
  };

  const columns = [
    { key: 'title',    label: 'Exam', render: r => (
      <div>
        <strong>{r.title}</strong>
        <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
          {r.section?.sectionName || ''}{r.subject?.subjectName ? ` · ${r.subject.subjectName}` : ''}
        </div>
      </div>
    )},
    { key: 'examDate', label: 'Date', render: r => (
      <div>
        {r.examDate ? new Date(r.examDate).toLocaleDateString('en-IN') : '—'}
        <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{r.startTime} · {r.duration} min</div>
      </div>
    )},
    { key: 'questions', label: 'Questions', render: r => `${r.questionCount || 0}/${r.totalQuestions}` },
    { key: 'marks',     label: 'Marks',     render: r => r.totalMarks },
    { key: 'status',    label: 'Status',    render: r => (
      <div>
        <Badge variant={STATUS_COLOR[r.status] || 'muted'}>{r.status || 'draft'}</Badge>
        {r.status === 'completed' && (
          <div style={{ marginTop: 2 }}>
            <Badge variant={r.resultApprovalStatus === 'approved' ? 'success' : r.resultApprovalStatus === 'rejected' ? 'danger' : 'warning'}>
              result: {r.resultApprovalStatus || 'pending'}
            </Badge>
          </div>
        )}
      </div>
    )},
    { key: 'actions', label: 'Actions', render: r => (
      <div className="actions" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {r.status === 'draft' && (
          <>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate(`${r._id}/questions`)}>Questions</button>
            <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Edit</button>
            <button className="btn btn-success btn-sm" onClick={() => handlePublish(r)}>Publish</button>
            <button className="btn btn-danger btn-sm" onClick={() => setDel(r)}>Delete</button>
          </>
        )}
        {['published', 'completed'].includes(r.status) && (
          <>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate(`${r._id}/submissions`)}>Submissions</button>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate(`${r._id}/analytics`)}>Analytics</button>
          </>
        )}
        {r.status === 'completed' && (
          <button className="btn btn-primary btn-sm" onClick={() => navigate(`${r._id}/approval`)}>Result Approval</button>
        )}
      </div>
    )},
  ];

  if (loading) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page">
      <PageHeader title="Aptitude Exams" subtitle={`${exams?.length ?? 0} exams`}
        action={<Button onClick={openCreate}>+ Create Exam</Button>} />

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <Table columns={columns} data={exams} emptyIcon="📝" emptyTitle="No exams created yet" />
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Exam' : 'Create Exam'}
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="exam-form" type="submit" loading={saving}>{editing ? 'Save' : 'Create'}</Button>
        </>}>
        <form id="exam-form" onSubmit={handleSave}>
          <div className="form-group">
            <label className="form-label required">Exam Title</label>
            <input className="form-control" required value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Section</label>
              <select className="form-control" required value={form.sectionId}
                onChange={e => setForm(f => ({ ...f, sectionId: e.target.value }))}>
                <option value="">Select section…</option>
                {sections.map(s => (
                  <option key={s._id} value={s._id}>
                    {s.class?.className ? `${s.class.className} — ` : ''}{s.sectionName}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Subject (optional)</label>
              <select className="form-control" value={form.subjectId}
                onChange={e => setForm(f => ({ ...f, subjectId: e.target.value }))}>
                <option value="">General / none</option>
                {subjects.map(s => <option key={s._id} value={s._id}>{s.subjectName}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Exam Date</label>
              <input type="date" className="form-control" required value={form.examDate}
                onChange={e => setForm(f => ({ ...f, examDate: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label required">Start Time</label>
              <input type="time" className="form-control" required value={form.startTime}
                onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Duration (minutes)</label>
              <input type="number" min="5" className="form-control" required value={form.duration}
                onChange={e => setForm(f => ({ ...f, duration: +e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label required">Total Questions</label>
              <input type="number" min="1" className="form-control" required value={form.totalQuestions}
                onChange={e => setForm(f => ({ ...f, totalQuestions: +e.target.value }))} />
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Total Marks</label>
              <input type="number" min="1" className="form-control" required value={form.totalMarks}
                onChange={e => setForm(f => ({ ...f, totalMarks: +e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Max Violations (anti-cheat)</label>
              <input type="number" min="1" max="10" className="form-control" value={form.maxViolations}
                onChange={e => setForm(f => ({ ...f, maxViolations: +e.target.value }))} />
            </div>
          </div>
        </form>
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={handleDelete}
        loading={delLoad} title="Delete Exam" message={`Delete "${del?.title}"? All its questions and attempts will be removed.`} />
    </div>
  );
}
