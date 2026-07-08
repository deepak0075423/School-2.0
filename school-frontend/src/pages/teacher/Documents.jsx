import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import {
  getDocuments, uploadDocument, deleteDocument,
  getDocumentSubs, reviewSubmission, getMySection, getDocumentCategories,
} from '../../api/teacher.api';
import { PageHeader, Table, Badge, Button, Confirm, Modal, Spinner, Pagination } from '../../components/ui/index';

const BADGE = { notice: 'info', assignment: 'warning', circular: 'primary', resource: 'success', policy: 'danger', other: 'secondary' };

// Uploads are served from the backend root (not under /api) — strip the /api suffix
const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');

function fileUrl(filePath) {
  if (!filePath) return '';
  const p = filePath.replace(/\\/g, '/');
  const idx = p.indexOf('uploads/');
  return idx !== -1 ? `${API_BASE}/${p.slice(idx)}` : `${API_BASE}/${p}`;
}

function FileLinks({ files }) {
  if (!files?.length) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {files.map((f, i) => (
        <a key={i} href={fileUrl(f.filePath)} target="_blank" rel="noreferrer"
          style={{ fontSize: '.8rem', color: 'var(--primary)' }}>
          {f.originalName}
        </a>
      ))}
    </div>
  );
}

const EMPTY_FORM = { title: '', description: '', category: '', isAssignment: false, dueDate: '' };

function UploadModal({ open, onClose, sectionId, sectionName, categories, onUploaded }) {
  const [form, setForm]       = useState(EMPTY_FORM);
  const [files, setFiles]     = useState([]);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async () => {
    if (!form.title.trim()) return toast.error('Title is required');
    if (!form.category)     return toast.error('Category is required');
    if (!sectionId)         return toast.error('No class section assigned to you');

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('title', form.title.trim());
      fd.append('description', form.description);
      fd.append('category', form.category);
      fd.append('sectionId', sectionId);
      fd.append('isAssignment', form.isAssignment ? 'true' : '');
      if (form.isAssignment && form.dueDate) fd.append('dueDate', form.dueDate);
      files.forEach(f => fd.append('files', f));

      await uploadDocument(fd);
      toast.success('Document uploaded');
      setForm(EMPTY_FORM);
      setFiles([]);
      onClose();
      onUploaded();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Upload Document"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleUpload} loading={uploading}>Upload</Button>
      </>}>
      <div className="form-group">
        <label className="form-label">Title *</label>
        <input className="form-control" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Document title" />
      </div>
      <div className="form-group">
        <label className="form-label">Description</label>
        <textarea className="form-control" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="form-group">
          <label className="form-label">Category</label>
          <select className="form-control" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
            <option value="">— Select —</option>
            {categories.map(c => <option key={c._id} value={c.name}>{c.name}</option>)}
          </select>
          {categories.length === 0 && <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 4 }}>No categories available</div>}
        </div>
        <div className="form-group">
          <label className="form-label">Target Section</label>
          <input className="form-control" value={sectionName || 'No section assigned'} disabled />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <input type="checkbox" id="isAssignment" checked={form.isAssignment} onChange={e => setForm(f => ({ ...f, isAssignment: e.target.checked }))} />
        <label htmlFor="isAssignment" style={{ margin: 0, cursor: 'pointer' }}>This is an assignment</label>
      </div>
      {form.isAssignment && (
        <div className="form-group">
          <label className="form-label">Due Date</label>
          <input type="date" className="form-control" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
        </div>
      )}
      <div className="form-group">
        <label className="form-label">Files</label>
        <input type="file" className="form-control" multiple onChange={e => setFiles(Array.from(e.target.files))} />
        {files.length > 0 && <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginTop: 4 }}>{files.length} file(s) selected</div>}
      </div>
    </Modal>
  );
}

export default function TeacherDocuments() {
  const [page, setPage] = useState(1);

  const [showUpload, setShowUpload] = useState(false);

  // Delete state
  const [delDoc, setDelDoc]   = useState(null);
  const [delLoad, setDelLoad] = useState(false);

  // Detail modal
  const [viewDoc, setViewDoc] = useState(null);

  // Submissions modal
  const [subsDoc, setSubsDoc]     = useState(null);
  const [subs, setSubs]           = useState([]);
  const [subsLoading, setSubsLoading] = useState(false);

  // Review modal
  const [reviewSub, setReviewSub] = useState(null);
  const [reviewForm, setReviewForm] = useState({ marks: '', feedback: '' });
  const [reviewing, setReviewing]   = useState(false);

  const { data: secData } = useFetch(getMySection);
  const { data: catData } = useFetch(getDocumentCategories);
  const categories        = catData  || [];   // useFetch already unwraps res.data
  const sectionId         = secData?.section?._id;
  const sectionName       = secData?.section ? `${secData.section.class?.className || ''} - Section ${secData.section.sectionName || ''}`.trim() : '';

  // Paginated docs — manual fetch to preserve total/pages
  const [docs, setDocs]     = useState([]);
  const [total, setTotal]   = useState(0);
  const [pages, setPages]   = useState(1);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getDocuments({ page, limit: 20 });
      setDocs(res.data || []);
      setTotal(res.total || 0);
      setPages(res.pages || 1);
    } catch (err) {
      toast.error(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { refetch(); }, [refetch]);

  const handleDelete = async () => {
    setDelLoad(true);
    try {
      await deleteDocument(delDoc._id);
      toast.success('Deleted');
      setDelDoc(null);
      refetch();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    } finally {
      setDelLoad(false);
    }
  };

  const openSubmissions = async (doc) => {
    setSubsDoc(doc);
    setSubs([]);
    setSubsLoading(true);
    try {
      const res = await getDocumentSubs(doc._id);
      setSubs(res.data || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    } finally {
      setSubsLoading(false);
    }
  };

  const handleReview = async () => {
    setReviewing(true);
    try {
      await reviewSubmission(reviewSub._id, { marks: reviewForm.marks, feedback: reviewForm.feedback });
      toast.success('Review saved');
      setReviewSub(null);
      openSubmissions(subsDoc);
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    } finally {
      setReviewing(false);
    }
  };

  const columns = [
    {
      key: 'title', label: 'Title',
      render: r => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.title}</div>
          {r.description && <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{r.description}</div>}
        </div>
      ),
    },
    { key: 'category', label: 'Category', render: r => <Badge variant={BADGE[r.category] || 'info'}>{r.category}</Badge> },
    { key: 'files',    label: 'Files',    render: r => r.files?.length || 0 },
    { key: 'date',     label: 'Date',     render: r => new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
    {
      key: 'actions', label: '',
      render: r => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setViewDoc(r)}>View</button>
          {r.isAssignment && (
            <button className="btn btn-primary btn-sm" onClick={() => openSubmissions(r)}>Submissions</button>
          )}
          {r.uploadedBy?._id === undefined || true ? (
            <button className="btn btn-danger btn-sm" onClick={() => setDelDoc(r)}>Delete</button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Documents"
        subtitle={sectionName ? `Class: ${sectionName}` : 'Shared files and assignments'}
        action={<Button onClick={() => setShowUpload(true)}>+ Upload</Button>}
      />

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading
            ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={docs} emptyIcon="📁" emptyTitle="No documents yet" />}
        </div>
        {pages > 1 && (
          <div className="card-footer">
            <Pagination page={page} pages={pages} total={total} onPage={setPage} />
          </div>
        )}
      </div>

      {/* Upload Modal */}
      <UploadModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        sectionId={sectionId}
        sectionName={sectionName}
        categories={categories}
        onUploaded={refetch}
      />

      {/* View Detail Modal */}
      <Modal open={!!viewDoc} onClose={() => setViewDoc(null)} title={viewDoc?.title || 'Document'}>
        {viewDoc && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {viewDoc.description && <p style={{ margin: 0, color: 'var(--text-muted)' }}>{viewDoc.description}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div><span style={{ fontWeight: 600 }}>Category: </span><Badge variant={BADGE[viewDoc.category] || 'info'}>{viewDoc.category}</Badge></div>
              <div><span style={{ fontWeight: 600 }}>Uploaded: </span>{new Date(viewDoc.createdAt).toLocaleDateString('en-IN')}</div>
              {viewDoc.isAssignment && viewDoc.dueDate && (
                <div><span style={{ fontWeight: 600 }}>Due: </span>{new Date(viewDoc.dueDate).toLocaleDateString('en-IN')}</div>
              )}
            </div>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Files</div>
              <FileLinks files={viewDoc.files} />
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirm */}
      <Confirm open={!!delDoc} onClose={() => setDelDoc(null)} onConfirm={handleDelete}
        loading={delLoad} title="Delete Document" message={`Delete "${delDoc?.title}"?`} />

      {/* Submissions Modal */}
      <Modal open={!!subsDoc} onClose={() => setSubsDoc(null)} title={`Submissions — ${subsDoc?.title || ''}`} maxWidth={700}>
        {subsLoading
          ? <div style={{ padding: 32, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
          : subs.length === 0
            ? <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>No submissions yet</p>
            : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Student', 'Status', 'Submitted', 'Marks', 'Feedback', ''].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {subs.map(s => (
                    <tr key={s._id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 10px' }}>{s.student?.name || '—'}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <Badge variant={s.status === 'submitted' ? 'success' : s.status === 'late' ? 'warning' : 'secondary'}>
                          {s.status}
                        </Badge>
                      </td>
                      <td style={{ padding: '8px 10px' }}>{s.submittedAt ? new Date(s.submittedAt).toLocaleDateString('en-IN') : '—'}</td>
                      <td style={{ padding: '8px 10px' }}>{s.marks ?? '—'}</td>
                      <td style={{ padding: '8px 10px', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.feedback || '—'}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => { setReviewSub(s); setReviewForm({ marks: s.marks ?? '', feedback: s.feedback || '' }); }}>
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
      </Modal>

      {/* Review Modal */}
      <Modal open={!!reviewSub} onClose={() => setReviewSub(null)} title={`Review — ${reviewSub?.student?.name || ''}`}
        footer={<>
          <Button variant="secondary" onClick={() => setReviewSub(null)}>Cancel</Button>
          <Button onClick={handleReview} loading={reviewing}>Save</Button>
        </>}>
        <div className="form-group">
          <label className="form-label">Marks</label>
          <input type="number" className="form-control" value={reviewForm.marks} onChange={e => setReviewForm(f => ({ ...f, marks: e.target.value }))} placeholder="e.g. 18" />
        </div>
        <div className="form-group">
          <label className="form-label">Feedback</label>
          <textarea className="form-control" rows={3} value={reviewForm.feedback} onChange={e => setReviewForm(f => ({ ...f, feedback: e.target.value }))} placeholder="Optional feedback" />
        </div>
        {reviewSub?.files?.length > 0 && (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Submitted Files</div>
            <FileLinks files={reviewSub.files} />
          </div>
        )}
      </Modal>
    </div>
  );
}
