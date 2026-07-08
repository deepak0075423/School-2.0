import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { PageHeader, Table, Badge, Button, Modal, Confirm, Spinner } from '../../components/ui/index';

const STATUS = {
  DRAFT:          { label: 'Draft',           variant: 'muted' },
  MARKS_PENDING:  { label: 'Marks pending',   variant: 'warning' },
  SUBMITTED:      { label: 'Submitted',       variant: 'info' },
  CLASS_APPROVED: { label: 'Class approved',  variant: 'primary' },
  FINAL_APPROVED: { label: 'Published',       variant: 'success' },
  REJECTED:       { label: 'Rejected',        variant: 'danger' },
  REOPENED:       { label: 'Reopened',        variant: 'warning' },
};
const EXAM_TYPES = [['MID_TERM','Mid Term'],['FINAL','Final'],['UNIT_TEST','Unit Test']];

const EMPTY_FORM = { sectionId: '', title: '', examType: 'MID_TERM', startDate: '', endDate: '', publishDate: '' };

export default function AdminResults() {
  const [statusFilter, setStatusFilter] = useState('');
  const { data, loading, refetch } = useFetch(
    () => api.getFormalExams({ status: statusFilter || undefined }), [statusFilter]);
  const { data: classData } = useFetch(() => api.getClassesWithSections(true), []);

  const [modal, setModal]     = useState(false);
  const [form, setForm]       = useState(EMPTY_FORM);
  const [subjectRows, setSubjectRows] = useState([]);
  const [saving, setSaving]   = useState(false);
  const [del, setDel]         = useState(null);
  const [review, setReview]   = useState(null);
  const [reviewData, setReviewData] = useState(null);
  const [rejectFor, setRejectFor]   = useState(null);
  const [reason, setReason]   = useState('');
  const [busy, setBusy]       = useState(false);

  const sections = (classData || []).flatMap(c =>
    (c.sections || []).map(s => ({ ...s, className: c.className })));

  // Load section subjects when section changes in the create form
  useEffect(() => {
    if (!form.sectionId) { setSubjectRows([]); return; }
    (async () => {
      try {
        const res = await api.getResultSectionSubjects(form.sectionId);
        const seen = new Set();
        const rows = [];
        (res?.data || []).forEach(t => {
          const id = t.subject?._id;
          if (!id || seen.has(String(id))) return;
          seen.add(String(id));
          rows.push({
            subject: id,
            name:    t.subject?.subjectName || t.subject?.name || 'Subject',
            maxMarks: 100, passingMarks: 33, examDate: '',
            include: true,
          });
        });
        setSubjectRows(rows);
      } catch { setSubjectRows([]); }
    })();
  }, [form.sectionId]);

  const handleCreate = async (e) => {
    e.preventDefault();
    const subjects = subjectRows.filter(r => r.include).map((r, i) => ({
      subject: r.subject, maxMarks: +r.maxMarks, passingMarks: +r.passingMarks,
      examDate: r.examDate || null, order: i,
    }));
    if (!subjects.length) return toast.error('Include at least one subject');
    setSaving(true);
    try {
      await api.createFormalExam({ ...form, subjects });
      toast.success('Exam created (draft)');
      setModal(false);
      setForm(EMPTY_FORM);
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const openMarksEntry = async (exam) => {
    setBusy(true);
    try {
      await api.updateFormalExam(exam._id, { status: 'MARKS_PENDING' });
      toast.success('Marks entry opened — subject teachers can now enter marks');
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  };

  const approve = async (exam) => {
    setBusy(true);
    try {
      await api.approveFormalExam(exam._id);
      toast.success('Results published — student results generated');
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  };

  const doReject = async () => {
    if (!reason.trim()) return toast.error('Provide a reason');
    setBusy(true);
    try {
      await api.rejectFormalExam(rejectFor._id, { reason });
      toast.success('Exam rejected');
      setRejectFor(null); setReason('');
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  };

  const reopen = async (exam) => {
    setBusy(true);
    try {
      await api.reopenFormalExam(exam._id, {});
      toast.success('Exam reopened for marks entry');
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  };

  const handleDelete = async () => {
    try {
      await api.deleteFormalExam(del._id);
      toast.success('Deleted');
      setDel(null);
      refetch();
    } catch (err) { toast.error(err.message); }
  };

  const openReview = async (exam) => {
    setReview(exam); setReviewData(null);
    try {
      const res = await api.getMarksReview(exam._id);
      setReviewData(res.data);
    } catch (err) { toast.error(err.message); setReview(null); }
  };

  const columns = [
    { key: 'title', label: 'Exam', render: r => (
      <div>
        <strong>{r.title}</strong>
        <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
          {r.section?.sectionName || ''} · {(EXAM_TYPES.find(([k]) => k === r.examType)?.[1]) || r.examType}
        </div>
      </div>
    )},
    { key: 'dates', label: 'Schedule', render: r => (
      <div style={{ fontSize: '.85rem' }}>
        {r.startDate ? new Date(r.startDate).toLocaleDateString('en-IN') : '—'} → {r.endDate ? new Date(r.endDate).toLocaleDateString('en-IN') : '—'}
        {r.publishDate && <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>publish {new Date(r.publishDate).toLocaleDateString('en-IN')}</div>}
      </div>
    )},
    { key: 'subjects', label: 'Subjects', render: r => (r.subjects || []).length },
    { key: 'status', label: 'Status', render: r => {
      const s = STATUS[r.status] || { label: r.status, variant: 'muted' };
      return <Badge variant={s.variant}>{s.label}</Badge>;
    }},
    { key: 'actions', label: 'Actions', render: r => (
      <div className="actions" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {r.status === 'DRAFT' && (
          <>
            <Button size="sm" loading={busy} onClick={() => openMarksEntry(r)}>Open marks entry</Button>
            <button className="btn btn-danger btn-sm" onClick={() => setDel(r)}>Delete</button>
          </>
        )}
        {['SUBMITTED','CLASS_APPROVED','FINAL_APPROVED','MARKS_PENDING','REOPENED'].includes(r.status) && (
          <Button size="sm" variant="secondary" onClick={() => openReview(r)}>Marks review</Button>
        )}
        {r.status === 'CLASS_APPROVED' && (
          <>
            <Button size="sm" loading={busy} onClick={() => approve(r)}>✓ Publish</Button>
            <button className="btn btn-danger btn-sm" onClick={() => setRejectFor(r)}>Reject</button>
          </>
        )}
        {r.status === 'SUBMITTED' && (
          <button className="btn btn-danger btn-sm" onClick={() => setRejectFor(r)}>Reject</button>
        )}
        {r.status === 'REJECTED' && (
          <Button size="sm" variant="secondary" loading={busy} onClick={() => reopen(r)}>Reopen</Button>
        )}
      </div>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="Results & Assessments"
        subtitle="Formal exams — draft → marks entry → teacher validation → publish"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="form-control" style={{ width: 170 }} value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <Button onClick={() => setModal(true)}>+ Create Exam</Button>
          </div>
        } />

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={data} emptyIcon="📊" emptyTitle="No exams found" />}
        </div>
      </div>

      {/* Create exam */}
      <Modal open={modal} onClose={() => setModal(false)} title="Create Formal Exam" maxWidth={680}
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="exam-form" type="submit" loading={saving}>Create</Button>
        </>}>
        <form id="exam-form" onSubmit={handleCreate}>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Title</label>
              <input className="form-control" required value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label required">Type</label>
              <select className="form-control" value={form.examType}
                onChange={e => setForm(f => ({ ...f, examType: e.target.value }))}>
                {EXAM_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label required">Section</label>
            <select className="form-control" required value={form.sectionId}
              onChange={e => setForm(f => ({ ...f, sectionId: e.target.value }))}>
              <option value="">Select section…</option>
              {sections.map(s => (
                <option key={s._id} value={s._id}>{s.className ? `${s.className} — ` : ''}{s.sectionName}</option>
              ))}
            </select>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Start Date</label>
              <input type="date" className="form-control" required value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label required">End Date</label>
              <input type="date" className="form-control" required value={form.endDate}
                onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Result Publish Date (optional)</label>
            <input type="date" className="form-control" value={form.publishDate}
              onChange={e => setForm(f => ({ ...f, publishDate: e.target.value }))} />
          </div>
          {form.sectionId && (
            <div className="form-group">
              <label className="form-label">Subjects ({subjectRows.filter(r => r.include).length} included)</label>
              {subjectRows.length === 0 ? (
                <p style={{ fontSize: '.82rem', color: 'var(--text-muted)' }}>
                  No subject teachers assigned to this section yet — assign them in Sections first.
                </p>
              ) : (
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <table className="table" style={{ width: '100%', margin: 0 }}>
                    <thead><tr><th></th><th>Subject</th><th style={{ width: 90 }}>Max</th><th style={{ width: 90 }}>Pass</th><th style={{ width: 140 }}>Exam date</th></tr></thead>
                    <tbody>
                      {subjectRows.map((r, i) => (
                        <tr key={r.subject}>
                          <td style={{ textAlign: 'center' }}>
                            <input type="checkbox" checked={r.include}
                              onChange={e => setSubjectRows(rows => rows.map((x, j) => j === i ? { ...x, include: e.target.checked } : x))} />
                          </td>
                          <td>{r.name}</td>
                          <td><input type="number" min="1" className="form-control" value={r.maxMarks}
                            onChange={e => setSubjectRows(rows => rows.map((x, j) => j === i ? { ...x, maxMarks: e.target.value } : x))} /></td>
                          <td><input type="number" min="0" className="form-control" value={r.passingMarks}
                            onChange={e => setSubjectRows(rows => rows.map((x, j) => j === i ? { ...x, passingMarks: e.target.value } : x))} /></td>
                          <td><input type="date" className="form-control" value={r.examDate}
                            onChange={e => setSubjectRows(rows => rows.map((x, j) => j === i ? { ...x, examDate: e.target.value } : x))} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </form>
      </Modal>

      {/* Marks review */}
      <Modal open={!!review} onClose={() => setReview(null)} maxWidth={680}
        title={review ? `Marks Review — ${review.title}` : ''}>
        {!reviewData ? (
          <div style={{ padding: 32, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
        ) : (
          <>
            {(reviewData.exam?.subjects || []).map((cfg, i) => {
              const sheet = (reviewData.sheets || []).find(s =>
                String(s.subject?._id || s.subject) === String(cfg.subject?._id || cfg.subject));
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '.9rem' }}>
                  <span>{cfg.subject?.subjectName || cfg.subject?.name || 'Subject'} <span style={{ color: 'var(--text-muted)', fontSize: '.78rem' }}>(max {cfg.maxMarks})</span></span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>
                    {sheet?.submittedBy?.name ? `by ${sheet.submittedBy.name}` : ''} · {sheet?.entries?.length || 0} entries
                  </span>
                  <Badge variant={sheet?.status === 'SUBMITTED' ? 'success' : 'warning'}>{sheet?.status || 'NOT STARTED'}</Badge>
                </div>
              );
            })}
          </>
        )}
      </Modal>

      {/* Reject */}
      <Modal open={!!rejectFor} onClose={() => setRejectFor(null)} title={`Reject — ${rejectFor?.title}`}
        footer={<>
          <Button variant="secondary" onClick={() => setRejectFor(null)}>Cancel</Button>
          <Button variant="danger" loading={busy} onClick={doReject}>Reject</Button>
        </>}>
        <div className="form-group">
          <label className="form-label required">Reason</label>
          <textarea className="form-control" rows={3} value={reason} onChange={e => setReason(e.target.value)} />
        </div>
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={handleDelete}
        title="Delete Exam" message={`Delete "${del?.title}"?`} />
    </div>
  );
}
