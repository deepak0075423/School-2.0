import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getFeeCategories, createFeeCategory } from '../../../api/fees.api';
import { PageHeader, Table, Button, Modal, Spinner } from '../../../components/ui/index';

export default function FeeCategories() {
  const { data: categories, loading, refetch } = useFetch(getFeeCategories);
  const [modal,  setModal]  = useState(false);
  const [saving, setSaving] = useState(false);
  const [form,   setForm]   = useState({ name: '', description: '' });

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createFeeCategory(form);
      toast.success('Category created');
      setModal(false);
      setForm({ name: '', description: '' });
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const columns = [
    { key: 'name',        label: 'Name',        render: r => <strong>{r.name}</strong> },
    { key: 'description', label: 'Description', render: r => r.description || '—' },
    { key: 'createdAt',   label: 'Created',     render: r => new Date(r.createdAt).toLocaleDateString() },
  ];

  return (
    <div className="page">
      <PageHeader title="Fee Categories" subtitle="Manage fee categories"
        action={<Button onClick={() => setModal(true)}>+ Add Category</Button>} />
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={categories} emptyIcon="🗂️" emptyTitle="No categories" />}
        </div>
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title="Add Fee Category"
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="cat-form" type="submit" loading={saving}>Save</Button>
        </>}>
        <form id="cat-form" onSubmit={handleSave}>
          <div className="form-group">
            <label className="form-label required">Name</label>
            <input className="form-control" required value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-control" rows={2} value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
        </form>
      </Modal>
    </div>
  );
}
