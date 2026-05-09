import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getBooks, createBook, deleteBook } from '../../../api/library.api';
import { PageHeader, Table, Badge, Button, Modal, Confirm, Spinner } from '../../../components/ui/index';

export default function LibraryBooks() {
  const [search, setSearch] = useState('');
  const { data: books, loading, refetch } = useFetch(() => getBooks({ search }), [search]);
  const [modal,  setModal]  = useState(false);
  const [del,    setDel]    = useState(null);
  const [saving, setSaving] = useState(false);
  const [delLoad,setDelLoad]= useState(false);
  const [form,   setForm]   = useState({ title: '', author: '', isbn: '', category: '', copies: 1 });

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createBook(form);
      toast.success('Book added');
      setModal(false);
      setForm({ title: '', author: '', isbn: '', category: '', copies: 1 });
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDelLoad(true);
    try {
      await deleteBook(del._id);
      toast.success('Book deleted');
      setDel(null);
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setDelLoad(false); }
  };

  const columns = [
    { key: 'title',     label: 'Title',    render: r => <strong>{r.title}</strong> },
    { key: 'author',    label: 'Author',   render: r => r.author || '—' },
    { key: 'isbn',      label: 'ISBN',     render: r => r.isbn || '—' },
    { key: 'category',  label: 'Category', render: r => r.category ? <Badge variant="info">{r.category}</Badge> : '—' },
    { key: 'copies',    label: 'Copies',   render: r => `${r.availableCopies ?? r.copies ?? 0}/${r.copies || 0}` },
    { key: 'actions',   label: '',         render: r => (
      <button className="btn btn-danger btn-sm" onClick={() => setDel(r)}>Delete</button>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="Books" subtitle="Library book catalog"
        action={<Button onClick={() => setModal(true)}>+ Add Book</Button>} />
      <div style={{ marginBottom: 16 }}>
        <input className="form-control" placeholder="Search books..." style={{ maxWidth: 280 }}
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={books?.books || books} emptyIcon="📚" emptyTitle="No books found" />}
        </div>
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title="Add Book"
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="book-form" type="submit" loading={saving}>Add</Button>
        </>}>
        <form id="book-form" onSubmit={handleSave}>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Title</label>
              <input className="form-control" required value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Author</label>
              <input className="form-control" value={form.author}
                onChange={e => setForm(f => ({ ...f, author: e.target.value }))} />
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">ISBN</label>
              <input className="form-control" value={form.isbn}
                onChange={e => setForm(f => ({ ...f, isbn: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Category</label>
              <input className="form-control" value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Total Copies</label>
            <input type="number" className="form-control" min={1} value={form.copies}
              onChange={e => setForm(f => ({ ...f, copies: +e.target.value }))} />
          </div>
        </form>
      </Modal>
      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={handleDelete} loading={delLoad}
        title="Delete Book" message={`Delete "${del?.title}"?`} />
    </div>
  );
}
