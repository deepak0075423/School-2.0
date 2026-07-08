import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import {
  getDocuments, uploadDocument, updateDocument, deleteDocument, archiveDocument,
  getDocumentCategories, createDocumentCategory, deleteDocumentCategory,
  getClassesWithSections,
} from '../../api/admin.api';
import { PageHeader, Table, Badge, Button, Confirm, Modal, Spinner, Pagination } from '../../components/ui/index';

const TARGET_TYPES = [
  { value: 'whole_school',   label: 'Whole School' },
  { value: 'class',          label: 'By Class' },
  { value: 'class_sections', label: 'By Section' },
  { value: 'all_teachers',   label: 'All Teachers' },
];

const EMPTY_FORM = { title: '', description: '', category: '', targetType: 'whole_school', isAssignment: false, dueDate: '' };

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

// Multi-select checkboxes for classes or sections
function TargetPicker({ targetType, classData, selectedClasses, onClassToggle, selectedSections, onSectionToggle }) {
  if (targetType === 'class') {
    return (
      <div className="form-group">
        <label className="form-label">Select Classes *</label>
        <div style={{ border: '1px solid var(--border)', borderRadius: 6, maxHeight: 200, overflowY: 'auto', padding: 8 }}>
          {classData.length === 0
            ? <span style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>No classes found</span>
            : classData.map(c => (
              <label key={c._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
                <input type="checkbox" checked={selectedClasses.includes(c._id)}
                  onChange={() => onClassToggle(c._id)} />
                <span>Class {c.classNumber} — {c.className}</span>
              </label>
            ))}
        </div>
        {selectedClasses.length > 0 && (
          <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{selectedClasses.length} class(es) selected</div>
        )}
      </div>
    );
  }

  if (targetType === 'class_sections') {
    return (
      <div className="form-group">
        <label className="form-label">Select Sections *</label>
        <div style={{ border: '1px solid var(--border)', borderRadius: 6, maxHeight: 220, overflowY: 'auto', padding: 8 }}>
          {classData.length === 0
            ? <span style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>No sections found</span>
            : classData.map(c => (
              c.sections?.length > 0 && (
                <div key={c._id} style={{ marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>Class {c.classNumber} — {c.className}</div>
                  {c.sections.map(s => (
                    <label key={s._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', cursor: 'pointer', paddingLeft: 8 }}>
                      <input type="checkbox" checked={selectedSections.includes(s._id)}
                        onChange={() => onSectionToggle(s._id)} />
                      <span>Section {s.sectionName}</span>
                    </label>
                  ))}
                </div>
              )
            ))}
        </div>
        {selectedSections.length > 0 && (
          <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{selectedSections.length} section(s) selected</div>
        )}
      </div>
    );
  }

  return null;
}

export default function Documents() {
  const [page, setPage]       = useState(1);
  const [search, setSearch]   = useState('');
  const [catFilter, setCatFilter] = useState('');

  // Upload
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [files, setFiles]           = useState([]);
  const [selClasses, setSelClasses]   = useState([]);
  const [selSections, setSelSections] = useState([]);

  // Edit
  const [editDoc, setEditDoc]         = useState(null);
  const [editForm, setEditForm]       = useState(EMPTY_FORM);
  const [editFiles, setEditFiles]     = useState([]);
  const [editClasses, setEditClasses]   = useState([]);
  const [editSections, setEditSections] = useState([]);
  const [saving, setSaving]           = useState(false);

  // Delete / Archive
  const [delDoc, setDelDoc]   = useState(null);
  const [delLoad, setDelLoad] = useState(false);
  const [archDoc, setArchDoc]   = useState(null);
  const [archLoad, setArchLoad] = useState(false);

  // View
  const [viewDoc, setViewDoc] = useState(null);

  // Manage Categories
  const [showCatMgr, setShowCatMgr] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [addingCat, setAddingCat]   = useState(false);
  const [delCat, setDelCat]         = useState(null);
  const [delCatLoad, setDelCatLoad] = useState(false);

  // Paginated docs — manual fetch so we keep total/pages metadata
  const [docs, setDocs]     = useState([]);
  const [total, setTotal]   = useState(0);
  const [pages, setPages]   = useState(1);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      // getDocuments resolves with the full response body: { success, data, total, page, pages }
      const res = await getDocuments({ page, limit: 20, search: search || undefined, category: catFilter || undefined });
      setDocs(res.data || []);
      setTotal(res.total || 0);
      setPages(res.pages || 1);
    } catch (err) {
      toast.error(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [page, search, catFilter]);

  useEffect(() => { refetch(); }, [refetch]);

  // Non-paginated — useFetch stores the inner array directly (res.data)
  const { data: catData, refetch: refetchCats } = useFetch(getDocumentCategories);
  const { data: classData }                     = useFetch(getClassesWithSections);

  const categories = catData  || [];
  const classes    = classData || [];

  const toggleItem = (id, list, setList) => setList(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleUpload = async () => {
    if (!form.title.trim()) return toast.error('Title is required');
    if (!form.category)     return toast.error('Category is required');
    if (form.targetType === 'class'          && selClasses.length === 0)  return toast.error('Select at least one class');
    if (form.targetType === 'class_sections' && selSections.length === 0) return toast.error('Select at least one section');

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('title',      form.title.trim());
      fd.append('description',form.description);
      fd.append('category',   form.category);
      fd.append('targetType', form.targetType);
      fd.append('targetClasses',  JSON.stringify(selClasses));
      fd.append('targetSections', JSON.stringify(selSections));
      fd.append('isAssignment', form.isAssignment ? 'true' : '');
      if (form.isAssignment && form.dueDate) fd.append('dueDate', form.dueDate);
      files.forEach(f => fd.append('files', f));

      await uploadDocument(fd);
      toast.success('Document uploaded');
      setShowUpload(false);
      setForm(EMPTY_FORM);
      setFiles([]);
      setSelClasses([]);
      setSelSections([]);
      refetch();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    } finally {
      setUploading(false);
    }
  };

  const openEdit = (doc) => {
    setEditDoc(doc);
    setEditForm({
      title:       doc.title,
      description: doc.description || '',
      category:    doc.category,
      targetType:  doc.targetType,
      isAssignment: doc.isAssignment || false,
      dueDate:     doc.dueDate ? doc.dueDate.slice(0, 10) : '',
    });
    setEditFiles([]);
    setEditClasses((doc.targetClasses || []).map(c => c._id || c));
    setEditSections((doc.targetSections || []).map(s => s._id || s));
  };

  const handleEdit = async () => {
    if (!editForm.title.trim()) return toast.error('Title is required');
    if (!editForm.category)     return toast.error('Category is required');
    if (editForm.targetType === 'class'          && editClasses.length === 0)  return toast.error('Select at least one class');
    if (editForm.targetType === 'class_sections' && editSections.length === 0) return toast.error('Select at least one section');

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('title',          editForm.title.trim());
      fd.append('description',    editForm.description);
      fd.append('category',       editForm.category);
      fd.append('targetType',     editForm.targetType);
      fd.append('targetClasses',  JSON.stringify(editClasses));
      fd.append('targetSections', JSON.stringify(editSections));
      if (editForm.dueDate) fd.append('dueDate', editForm.dueDate);
      editFiles.forEach(f => fd.append('files', f));

      await updateDocument(editDoc._id, fd);
      toast.success('Updated');
      setEditDoc(null);
      refetch();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDelLoad(true);
    try { await deleteDocument(delDoc._id); toast.success('Deleted'); setDelDoc(null); refetch(); }
    catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setDelLoad(false); }
  };

  const handleArchive = async () => {
    setArchLoad(true);
    try { await archiveDocument(archDoc._id); toast.success('Archived'); setArchDoc(null); refetch(); }
    catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setArchLoad(false); }
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return toast.error('Name is required');
    setAddingCat(true);
    try {
      await createDocumentCategory({ name: newCatName.trim() });
      toast.success('Category added');
      setNewCatName('');
      refetchCats();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    } finally {
      setAddingCat(false);
    }
  };

  const handleDeleteCategory = async () => {
    setDelCatLoad(true);
    try { await deleteDocumentCategory(delCat._id); toast.success('Deleted'); setDelCat(null); refetchCats(); }
    catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setDelCatLoad(false); }
  };

  // Shared form fields for upload & edit
  const FormFields = ({ f, setF, selC, setSelC, selS, setSelS, fileList, setFileList, isEdit }) => (
    <>
      <div className="form-group">
        <label className="form-label">Title *</label>
        <input className="form-control" value={f.title} onChange={e => setF(p => ({ ...p, title: e.target.value }))} placeholder="Document title" />
      </div>
      <div className="form-group">
        <label className="form-label">Description</label>
        <textarea className="form-control" rows={2} value={f.description} onChange={e => setF(p => ({ ...p, description: e.target.value }))} placeholder="Optional" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="form-group">
          <label className="form-label">Category *</label>
          <select className="form-control" value={f.category} onChange={e => setF(p => ({ ...p, category: e.target.value }))}>
            <option value="">— Select —</option>
            {categories.map(c => <option key={c._id} value={c.name}>{c.name}</option>)}
          </select>
          {categories.length === 0 && <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 4 }}>No categories yet. <button type="button" style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0, fontSize: '.75rem' }} onClick={() => setShowCatMgr(true)}>Manage Categories</button></div>}
        </div>
        <div className="form-group">
          <label className="form-label">Target *</label>
          <select className="form-control" value={f.targetType} onChange={e => { setF(p => ({ ...p, targetType: e.target.value })); setSelC([]); setSelS([]); }}>
            {TARGET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>
      <TargetPicker
        targetType={f.targetType}
        classData={classes}
        selectedClasses={selC}
        onClassToggle={id => toggleItem(id, selC, setSelC)}
        selectedSections={selS}
        onSectionToggle={id => toggleItem(id, selS, setSelS)}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <input type="checkbox" id={`isAssign-${isEdit ? 'edit' : 'new'}`} checked={f.isAssignment} onChange={e => setF(p => ({ ...p, isAssignment: e.target.checked }))} />
        <label htmlFor={`isAssign-${isEdit ? 'edit' : 'new'}`} style={{ margin: 0, cursor: 'pointer' }}>This is an assignment</label>
      </div>
      {f.isAssignment && (
        <div className="form-group">
          <label className="form-label">Due Date</label>
          <input type="date" className="form-control" value={f.dueDate} onChange={e => setF(p => ({ ...p, dueDate: e.target.value }))} />
        </div>
      )}
      <div className="form-group">
        <label className="form-label">{isEdit ? 'Replace Files (leave empty to keep existing)' : 'Files'}</label>
        <input type="file" className="form-control" multiple onChange={e => setFileList(Array.from(e.target.files))} />
        {fileList.length > 0 && <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginTop: 4 }}>{fileList.length} file(s) selected</div>}
      </div>
      {isEdit && editDoc?.files?.length > 0 && fileList.length === 0 && (
        <div>
          <div style={{ fontWeight: 600, fontSize: '.85rem', marginBottom: 6 }}>Current Files</div>
          <FileLinks files={editDoc.files} />
        </div>
      )}
    </>
  );

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
    { key: 'category',  label: 'Category', render: r => <Badge variant="info">{r.category}</Badge> },
    { key: 'target',    label: 'Target',   render: r => TARGET_TYPES.find(t => t.value === r.targetType)?.label || r.targetType },
    { key: 'files',     label: 'Files',    render: r => r.files?.length || 0 },
    { key: 'createdAt', label: 'Uploaded', render: r => new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
    {
      key: 'actions', label: '',
      render: r => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setViewDoc(r)}>View</button>
          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Edit</button>
          <button className="btn btn-warning btn-sm"   onClick={() => setArchDoc(r)}>Archive</button>
          <button className="btn btn-danger btn-sm"    onClick={() => setDelDoc(r)}>Delete</button>
        </div>
      ),
    },
  ];

  return (
    <div className="page">
      <PageHeader title="Documents" subtitle="Shared files and notices"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={() => setShowCatMgr(true)}>Manage Categories</Button>
            <Button onClick={() => setShowUpload(true)}>+ Upload Document</Button>
          </div>
        }
      />

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <input className="form-control" style={{ maxWidth: 260 }} placeholder="Search title…"
          value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        <select className="form-control" style={{ maxWidth: 200 }}
          value={catFilter} onChange={e => { setCatFilter(e.target.value); setPage(1); }}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c._id} value={c.name}>{c.name}</option>)}
        </select>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading
            ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={docs} emptyIcon="📁" emptyTitle="No documents uploaded" />}
        </div>
        {pages > 1 && (
          <div className="card-footer">
            <Pagination page={page} pages={pages} total={total} onPage={setPage} />
          </div>
        )}
      </div>

      {/* View Modal */}
      <Modal open={!!viewDoc} onClose={() => setViewDoc(null)} title={viewDoc?.title || 'Document'}>
        {viewDoc && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {viewDoc.description && <p style={{ margin: 0, color: 'var(--text-muted)' }}>{viewDoc.description}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '.9rem' }}>
              <div><span style={{ fontWeight: 600 }}>Category: </span><Badge variant="info">{viewDoc.category}</Badge></div>
              <div><span style={{ fontWeight: 600 }}>Target: </span>{TARGET_TYPES.find(t => t.value === viewDoc.targetType)?.label || viewDoc.targetType}</div>
              <div><span style={{ fontWeight: 600 }}>Uploaded by: </span>{viewDoc.uploadedBy?.name || '—'}</div>
              {viewDoc.isAssignment && viewDoc.dueDate && (
                <div><span style={{ fontWeight: 600 }}>Due: </span>{new Date(viewDoc.dueDate).toLocaleDateString('en-IN')}</div>
              )}
            </div>
            {viewDoc.targetType === 'class' && (
              <div style={{ fontSize: '.9rem' }}>
                <span style={{ fontWeight: 600 }}>Classes: </span>
                {viewDoc.targetClasses?.length
                  ? viewDoc.targetClasses.map(c => `Class ${c.classNumber} — ${c.className}`).join(', ')
                  : <span style={{ color: 'var(--danger, #dc3545)' }}>None selected — edit to fix</span>}
              </div>
            )}
            {viewDoc.targetType === 'class_sections' && (
              <div style={{ fontSize: '.9rem' }}>
                <span style={{ fontWeight: 600 }}>Sections: </span>
                {viewDoc.targetSections?.length
                  ? viewDoc.targetSections.map(s => `Section ${s.sectionName}`).join(', ')
                  : <span style={{ color: 'var(--danger, #dc3545)' }}>None selected — edit to fix</span>}
              </div>
            )}
            <div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Files</div>
              <FileLinks files={viewDoc.files} />
            </div>
          </div>
        )}
      </Modal>

      {/* Upload Modal */}
      <Modal open={showUpload} onClose={() => setShowUpload(false)} title="Upload Document" maxWidth={600}
        footer={<>
          <Button variant="secondary" onClick={() => setShowUpload(false)}>Cancel</Button>
          <Button onClick={handleUpload} loading={uploading}>Upload</Button>
        </>}>
        <FormFields f={form} setF={setForm} selC={selClasses} setSelC={setSelClasses} selS={selSections} setSelS={setSelSections} fileList={files} setFileList={setFiles} isEdit={false} />
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editDoc} onClose={() => setEditDoc(null)} title="Edit Document" maxWidth={600}
        footer={<>
          <Button variant="secondary" onClick={() => setEditDoc(null)}>Cancel</Button>
          <Button onClick={handleEdit} loading={saving}>Save Changes</Button>
        </>}>
        <FormFields f={editForm} setF={setEditForm} selC={editClasses} setSelC={setEditClasses} selS={editSections} setSelS={setEditSections} fileList={editFiles} setFileList={setEditFiles} isEdit={true} />
      </Modal>

      {/* Archive Confirm */}
      <Confirm open={!!archDoc} onClose={() => setArchDoc(null)} onConfirm={handleArchive}
        loading={archLoad} title="Archive Document" message={`Archive "${archDoc?.title}"? It will be hidden from users.`} />

      {/* Delete Confirm */}
      <Confirm open={!!delDoc} onClose={() => setDelDoc(null)} onConfirm={handleDelete}
        loading={delLoad} title="Delete Document" message={`Permanently delete "${delDoc?.title}"?`} />

      {/* Manage Categories Modal */}
      <Modal open={showCatMgr} onClose={() => setShowCatMgr(false)} title="Manage Document Categories">
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input className="form-control" placeholder="New category name…" value={newCatName}
            onChange={e => setNewCatName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddCategory()} />
          <Button onClick={handleAddCategory} loading={addingCat} style={{ whiteSpace: 'nowrap' }}>Add</Button>
        </div>
        {categories.length === 0
          ? <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>No categories yet</p>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {categories.map(c => (
                <div key={c._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-alt, #f8f9fa)', borderRadius: 6 }}>
                  <span style={{ fontWeight: 500 }}>{c.name}</span>
                  <button className="btn btn-danger btn-sm" onClick={() => setDelCat(c)}>Delete</button>
                </div>
              ))}
            </div>
          )}
      </Modal>

      {/* Delete Category Confirm */}
      <Confirm open={!!delCat} onClose={() => setDelCat(null)} onConfirm={handleDeleteCategory}
        loading={delCatLoad} title="Delete Category" message={`Delete category "${delCat?.name}"?`} />
    </div>
  );
}
