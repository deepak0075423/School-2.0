import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import { getDocuments, uploadDocument, deleteDocument } from '../../api/admin.api';
import { PageHeader, Table, Badge, Button, Confirm, Modal, Spinner, Pagination } from '../../components/ui/index';

const TARGET_TYPES = [
  { value: 'whole_school',      label: 'Whole School' },
  { value: 'class',             label: 'By Class' },
  { value: 'class_sections',    label: 'By Section' },
  { value: 'all_teachers',      label: 'All Teachers' },
];

const CATEGORIES = ['notice', 'assignment', 'circular', 'resource', 'policy', 'other'];

export default function Documents() {
  const [page, setPage]     = useState(1);
  const [del, setDel]       = useState(null);
  const [delLoad, setDL]    = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading]   = useState(false);

  const [form, setForm] = useState({
    title: '', description: '', category: 'notice', targetType: 'whole_school', dueDate: '',
  });
  const [files, setFiles] = useState([]);

  const { data, loading, refetch } = useFetch(() => getDocuments({ page, limit: 20 }), [page]);
  const docs = data?.data || [];

  const handleDelete = async () => {
    setDL(true);
    try { await deleteDocument(del._id); toast.success('Deleted'); setDel(null); refetch(); }
    catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setDL(false); }
  };

  const handleUpload = async () => {
    if (!form.title.trim()) return toast.error('Title is required');
    if (!form.category)     return toast.error('Category is required');
    if (!form.targetType)   return toast.error('Target type is required');

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('title',      form.title.trim());
      fd.append('description',form.description);
      fd.append('category',   form.category);
      fd.append('targetType', form.targetType);
      if (form.dueDate) fd.append('dueDate', form.dueDate);
      files.forEach(f => fd.append('files', f));

      await uploadDocument(fd);
      toast.success('Document uploaded');
      setShowUpload(false);
      setForm({ title: '', description: '', category: 'notice', targetType: 'whole_school', dueDate: '' });
      setFiles([]);
      refetch();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    } finally {
      setUploading(false);
    }
  };

  const columns = [
    { key: 'title',      label: 'Title',    render: r => <div><div style={{ fontWeight:600 }}>{r.title}</div>{r.description && <div style={{ fontSize:'.75rem',color:'var(--text-muted)' }}>{r.description}</div>}</div> },
    { key: 'category',   label: 'Category', render: r => <Badge variant="info">{r.category || '—'}</Badge> },
    { key: 'target',     label: 'Target',   render: r => TARGET_TYPES.find(t => t.value === r.targetType)?.label || r.targetType || 'All' },
    { key: 'files',      label: 'Files',    render: r => r.files?.length || 0 },
    { key: 'createdAt',  label: 'Uploaded', render: r => new Date(r.createdAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) },
    { key: 'actions',    label: '',         render: r => (
      <button className="btn btn-danger btn-sm" onClick={() => setDel(r)}>Delete</button>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="Documents" subtitle="Shared files and notices"
        action={<Button onClick={() => setShowUpload(true)}>+ Upload Document</Button>} />

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding:48, display:'flex', justifyContent:'center' }}><Spinner /></div>
            : <Table columns={columns} data={docs} emptyIcon="📁" emptyTitle="No documents uploaded" />}
        </div>
        {data?.pages > 1 && <div className="card-footer"><Pagination page={page} pages={data.pages} total={data.total} onPage={setPage} /></div>}
      </div>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={handleDelete}
        loading={delLoad} title="Delete Document" message={`Delete "${del?.title}"?`} />

      <Modal open={showUpload} onClose={() => setShowUpload(false)} title="Upload Document"
        footer={<>
          <Button variant="secondary" onClick={() => setShowUpload(false)}>Cancel</Button>
          <Button onClick={handleUpload} loading={uploading}>Upload</Button>
        </>}>
        <div className="form-group">
          <label className="form-label">Title *</label>
          <input className="form-control" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Document title" />
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <textarea className="form-control" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div className="form-group">
            <label className="form-label">Category *</label>
            <select className="form-control" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Target *</label>
            <select className="form-control" value={form.targetType} onChange={e => setForm(f => ({ ...f, targetType: e.target.value }))}>
              {TARGET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Due Date (if assignment)</label>
          <input type="date" className="form-control" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Files</label>
          <input type="file" className="form-control" multiple onChange={e => setFiles(Array.from(e.target.files))} />
          {files.length > 0 && <div style={{ fontSize:'.8rem', color:'var(--text-muted)', marginTop:4 }}>{files.length} file(s) selected</div>}
        </div>
      </Modal>
    </div>
  );
}
