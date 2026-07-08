import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getBooks, createBook, updateBook, deleteBook } from '../../../api/library.api';
import { PageHeader, Table, Badge, Button, Modal, Confirm, Spinner, Pagination } from '../../../components/ui/index';

const EMPTY = { title: '', authors: '', isbn: '', publisher: '', category: '', language: 'English', description: '' };

export default function LibraryBooks() {
  const [search, setSearch] = useState('');
  const [page,   setPage]   = useState(1);
  const { data, loading, refetch } = useFetch(() => getBooks({ q: search || undefined, page, limit: 20 }), [search, page]);
  const books = Array.isArray(data) ? data : [];

  const [modal,    setModal]   = useState(false);
  const [editItem, setEditItem]= useState(null);
  const [del,      setDel]     = useState(null);
  const [saving,   setSaving]  = useState(false);
  const [delLoad,  setDL]      = useState(false);
  const [form,     setForm]    = useState(EMPTY);

  const openCreate = () => { setForm(EMPTY); setEditItem(null); setModal(true); };
  const openEdit   = (b) => {
    setForm({ title: b.title, authors: (b.authors||[]).join(', '), isbn: b.isbn||'',
      publisher: b.publisher||'', category: b.category||'', language: b.language||'English', description: b.description||'' });
    setEditItem(b); setModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = { ...form, authors: form.authors.split(',').map(a => a.trim()).filter(Boolean) };
      if (editItem) await updateBook(editItem._id, payload);
      else          await createBook(payload);
      toast.success(editItem ? 'Book updated' : 'Book added');
      setModal(false); refetch();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDL(true);
    try { await deleteBook(del._id); toast.success('Book deleted'); setDel(null); refetch(); }
    catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setDL(false); }
  };

  const columns = [
    { key: 'title',   label: 'Title',      render: r => <strong>{r.title}</strong> },
    { key: 'authors', label: 'Author(s)',  render: r => (r.authors||[]).join(', ') || '—' },
    { key: 'isbn',    label: 'ISBN',       render: r => r.isbn || '—' },
    { key: 'category',label: 'Category',   render: r => r.category ? <Badge variant="info">{r.category}</Badge> : '—' },
    { key: 'copies',  label: 'Avail/Total',render: r => `${r.availableCopies ?? 0} / ${r.totalCopies ?? 0}` },
    { key: 'actions', label: '', render: r => (
      <div style={{ display:'flex', gap:4 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Edit</button>
        <button className="btn btn-danger btn-sm"    onClick={() => setDel(r)}>Delete</button>
      </div>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="Books" subtitle="Library book catalog" action={<Button onClick={openCreate}>+ Add Book</Button>} />
      <div style={{ marginBottom:16 }}>
        <input className="form-control" placeholder="Search by title, ISBN…" style={{ maxWidth:300 }}
          value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
      </div>
      <div className="card">
        <div className="card-body" style={{ padding:0 }}>
          {loading ? <div style={{ padding:48, display:'flex', justifyContent:'center' }}><Spinner /></div>
            : <Table columns={columns} data={books} emptyIcon="📚" emptyTitle="No books found" />}
        </div>
        {data?.pages > 1 && <div className="card-footer"><Pagination page={page} pages={data.pages} total={data.total} onPage={setPage} /></div>}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editItem ? 'Edit Book' : 'Add Book'}
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="book-form" type="submit" loading={saving}>{editItem ? 'Save' : 'Add'}</Button></>}>
        <form id="book-form" onSubmit={handleSave}>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label required">Title</label>
              <input className="form-control" required value={form.title} onChange={e => setForm(f=>({...f,title:e.target.value}))} /></div>
            <div className="form-group"><label className="form-label">Author(s)</label>
              <input className="form-control" value={form.authors} placeholder="Comma-separated"
                onChange={e => setForm(f=>({...f,authors:e.target.value}))} /></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">ISBN</label>
              <input className="form-control" value={form.isbn} onChange={e => setForm(f=>({...f,isbn:e.target.value}))} /></div>
            <div className="form-group"><label className="form-label">Publisher</label>
              <input className="form-control" value={form.publisher} onChange={e => setForm(f=>({...f,publisher:e.target.value}))} /></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Category</label>
              <input className="form-control" value={form.category} onChange={e => setForm(f=>({...f,category:e.target.value}))} /></div>
            <div className="form-group"><label className="form-label">Language</label>
              <input className="form-control" value={form.language} onChange={e => setForm(f=>({...f,language:e.target.value}))} /></div>
          </div>
          <div className="form-group"><label className="form-label">Description</label>
            <textarea className="form-control" rows={2} value={form.description}
              onChange={e => setForm(f=>({...f,description:e.target.value}))} /></div>
        </form>
      </Modal>
      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={handleDelete} loading={delLoad}
        title="Delete Book" message={`Delete "${del?.title}"?`} />
    </div>
  );
}
