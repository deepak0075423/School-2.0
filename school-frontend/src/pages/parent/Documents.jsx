import React, { useState } from 'react';
import useFetch from '../../hooks/useFetch';
import { getDocuments } from '../../api/parent.api';
import { PageHeader, Table, Badge, Button, Modal, Spinner } from '../../components/ui/index';

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
  if (!files?.length) return <span style={{ color: 'var(--text-muted)' }}>No files attached</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {files.map((f, i) => (
        <a key={i} href={fileUrl(f.filePath)} target="_blank" rel="noreferrer"
          style={{ fontSize: '.85rem', color: 'var(--primary)' }}>
          {f.originalName}
        </a>
      ))}
    </div>
  );
}

export default function ParentDocuments() {
  const { data, loading } = useFetch(getDocuments);
  const docs = data || [];  // useFetch already unwraps res.data

  const [viewDoc, setViewDoc] = useState(null);

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
    { key: 'files', label: 'Files', render: r => r.files?.length ? `${r.files.length} file(s)` : '—' },
    {
      key: 'date', label: 'Uploaded',
      render: r => new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    },
    {
      key: 'actions', label: '',
      render: r => (
        <button className="btn btn-secondary btn-sm" onClick={() => setViewDoc(r)}>View</button>
      ),
    },
  ];

  return (
    <div className="page">
      <PageHeader title="Documents" subtitle="Files and notices shared with your child" />

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading
            ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={docs} emptyIcon="📁" emptyTitle="No documents shared" />}
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
              <div><span style={{ fontWeight: 600 }}>Date: </span>{new Date(viewDoc.createdAt).toLocaleDateString('en-IN')}</div>
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
    </div>
  );
}
