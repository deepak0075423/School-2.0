import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/teacher.api';
import { PageHeader, Table, Badge, Button, Modal, Confirm, Spinner } from '../../components/ui/index';

export default function TeacherExams() {
  const { data: exams, loading, refetch } = useFetch(api.getExams);
  const [modal, setModal]   = useState(false);
  const [del, setDel]       = useState(null);
  const [saving, setSaving] = useState(false);
  const [delLoad, setDL]    = useState(false);
  const [form, setForm]     = useState({ title: '', description: '', duration: 60, passingScore: 40, shuffleQuestions: true });

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await api.createExam(form); toast.success('Exam created'); setModal(false); refetch(); }
    catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handlePublish = async (id) => {
    try { await api.publishExam(id); toast.success('Exam published'); refetch(); }
    catch (err) { toast.error(err.message); }
  };

  const handleDelete = async () => {
    setDL(true);
    try { await api.deleteExam(del._id); toast.success('Deleted'); setDel(null); refetch(); }
    catch (err) { toast.error(err.message); }
    finally { setDL(false); }
  };

  const statusColor = { draft: 'muted', published: 'success', closed: 'danger' };

  const columns = [
    { key: 'title',       label: 'Exam',        render: r => <strong>{r.title}</strong> },
    { key: 'duration',    label: 'Duration',     render: r => `${r.duration} min` },
    { key: 'questions',   label: 'Questions',    render: r => r.questions?.length || 0 },
    { key: 'status',      label: 'Status',       render: r =>
      <Badge variant={statusColor[r.status] || 'muted'}>{r.status || 'draft'}</Badge> },
    { key: 'actions',     label: 'Actions',      render: r => (
      <div className="actions">
        {r.status === 'draft' && (
          <button className="btn btn-success btn-sm" onClick={() => handlePublish(r._id)}>Publish</button>
        )}
        <button className="btn btn-danger btn-sm" onClick={() => setDel(r)}>Delete</button>
      </div>
    )},
  ];

  if (loading) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page">
      <PageHeader title="Aptitude Exams" subtitle={`${exams?.length ?? 0} exams`}
        action={<Button onClick={() => setModal(true)}>+ Create Exam</Button>} />

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <Table columns={columns} data={exams} emptyIcon="📝" emptyTitle="No exams created yet" />
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Create Exam"
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="exam-form" type="submit" loading={saving}>Create</Button>
        </>}>
        <form id="exam-form" onSubmit={handleCreate}>
          <div className="form-group">
            <label className="form-label required">Exam Title</label>
            <input className="form-control" required value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-control" rows={3} value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Duration (minutes)</label>
              <input type="number" className="form-control" value={form.duration}
                onChange={e => setForm(f => ({ ...f, duration: +e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Passing Score (%)</label>
              <input type="number" className="form-control" value={form.passingScore}
                onChange={e => setForm(f => ({ ...f, passingScore: +e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.shuffleQuestions}
                onChange={e => setForm(f => ({ ...f, shuffleQuestions: e.target.checked }))} />
              Shuffle questions
            </label>
          </div>
        </form>
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={handleDelete}
        loading={delLoad} title="Delete Exam" message={`Delete "${del?.title}"?`} />
    </div>
  );
}
