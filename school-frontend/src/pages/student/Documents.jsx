import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import { getDocuments, submitAssignment } from '../../api/student.api';
import { PageHeader, Table, Badge, Button, Modal, Spinner } from '../../components/ui/index';

const BADGE = { notice: 'info', assignment: 'warning', circular: 'primary', resource: 'success', policy: 'danger', other: 'secondary' };

const STATUS_BADGE = { submitted: 'success', late: 'warning', pending: 'secondary' };

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

export default function StudentDocuments() {
  const { data, loading, refetch } = useFetch(getDocuments);
  const docs = data || [];  // useFetch already unwraps res.data

  // View detail modal
  const [viewDoc, setViewDoc] = useState(null);

  // Submit assignment modal
  const [submitDoc, setSubmitDoc]   = useState(null);
  const [subFiles, setSubFiles]     = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!subFiles.length) return toast.error('Please attach at least one file');
    setSubmitting(true);
    try {
      const fd = new FormData();
      subFiles.forEach(f => fd.append('files', f));
      await submitAssignment(submitDoc._id, fd);
      toast.success('Assignment submitted');
      setSubmitDoc(null);
      setSubFiles([]);
      refetch();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    } finally {
      setSubmitting(false);
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
    {
      key: 'due', label: 'Due',
      render: r => r.isAssignment && r.dueDate
        ? new Date(r.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : '—',
    },
    {
      key: 'status', label: 'Status',
      render: r => {
        if (!r.isAssignment) return '—';
        const sub = r.mySubmission;
        if (!sub) return <Badge variant="secondary">Pending</Badge>;
        return <Badge variant={STATUS_BADGE[sub.status] || 'secondary'}>{sub.status}</Badge>;
      },
    },
    { key: 'files', label: 'Files', render: r => r.files?.length ? `${r.files.length} file(s)` : '—' },
    {
      key: 'actions', label: '',
      render: r => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          {r.files?.length > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={() => setViewDoc(r)}>View</button>
          )}
          {r.isAssignment && r.allowSubmission && !r.mySubmission && (
            <button className="btn btn-primary btn-sm" onClick={() => { setSubmitDoc(r); setSubFiles([]); }}>Submit</button>
          )}
          {r.isAssignment && r.mySubmission && (
            <button className="btn btn-secondary btn-sm" onClick={() => { setSubmitDoc(r); setSubFiles([]); }}>Re-submit</button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="page">
      <PageHeader title="Documents & Notices" subtitle="Files and assignments shared with you" />

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading
            ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={docs} emptyIcon="📁" emptyTitle="No documents available" />}
        </div>
      </div>

      {/* View Detail Modal */}
      <Modal open={!!viewDoc} onClose={() => setViewDoc(null)} title={viewDoc?.title || 'Document'}>
        {viewDoc && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {viewDoc.description && <p style={{ margin: 0, color: 'var(--text-muted)' }}>{viewDoc.description}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '.9rem' }}>
              <div><span style={{ fontWeight: 600 }}>Category: </span><Badge variant={BADGE[viewDoc.category] || 'info'}>{viewDoc.category}</Badge></div>
              <div><span style={{ fontWeight: 600 }}>Uploaded by: </span>{viewDoc.uploadedBy?.name || '—'}</div>
              {viewDoc.isAssignment && viewDoc.dueDate && (
                <div><span style={{ fontWeight: 600 }}>Due: </span>{new Date(viewDoc.dueDate).toLocaleDateString('en-IN')}</div>
              )}
              {viewDoc.targetType === 'class' && viewDoc.targetClasses?.length > 0 && (
                <div style={{ gridColumn: '1/-1' }}>
                  <span style={{ fontWeight: 600 }}>For: </span>
                  {viewDoc.targetClasses.map(c => `Class ${c.classNumber}${c.className ? ` — ${c.className}` : ''}`).join(', ')}
                </div>
              )}
              {viewDoc.targetType === 'class_sections' && viewDoc.targetSections?.length > 0 && (
                <div style={{ gridColumn: '1/-1' }}>
                  <span style={{ fontWeight: 600 }}>For: </span>
                  {viewDoc.targetSections.map(s => `Section ${s.sectionName}`).join(', ')}
                </div>
              )}
            </div>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Files</div>
              <FileLinks files={viewDoc.files} />
            </div>
            {viewDoc.isAssignment && viewDoc.mySubmission && (
              <div style={{ background: 'var(--bg-alt, #f8f9fa)', borderRadius: 8, padding: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Your Submission</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: '.85rem' }}>
                  <div><span style={{ fontWeight: 600 }}>Status: </span><Badge variant={STATUS_BADGE[viewDoc.mySubmission.status] || 'secondary'}>{viewDoc.mySubmission.status}</Badge></div>
                  {viewDoc.mySubmission.marks != null && <div><span style={{ fontWeight: 600 }}>Marks: </span>{viewDoc.mySubmission.marks}</div>}
                  {viewDoc.mySubmission.feedback && <div style={{ gridColumn: '1/-1' }}><span style={{ fontWeight: 600 }}>Feedback: </span>{viewDoc.mySubmission.feedback}</div>}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Submit Assignment Modal */}
      <Modal open={!!submitDoc} onClose={() => setSubmitDoc(null)} title={`Submit — ${submitDoc?.title || ''}`}
        footer={<>
          <Button variant="secondary" onClick={() => setSubmitDoc(null)}>Cancel</Button>
          <Button onClick={handleSubmit} loading={submitting}>Submit</Button>
        </>}>
        {submitDoc && (
          <>
            {submitDoc.dueDate && (
              <p style={{ fontSize: '.85rem', color: new Date() > new Date(submitDoc.dueDate) ? 'var(--danger, #dc3545)' : 'var(--text-muted)', marginBottom: 12 }}>
                {new Date() > new Date(submitDoc.dueDate) ? '⚠ Due date has passed — submission will be marked late.' : `Due: ${new Date(submitDoc.dueDate).toLocaleDateString('en-IN')}`}
              </p>
            )}
            <div className="form-group">
              <label className="form-label">Attach Files *</label>
              <input type="file" className="form-control" multiple onChange={e => setSubFiles(Array.from(e.target.files))} />
              {subFiles.length > 0 && <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginTop: 4 }}>{subFiles.length} file(s) selected</div>}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
