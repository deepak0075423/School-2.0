import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getFeeHeads, getFeeCategories, createFeeHead } from '../../../api/fees.api';
import { PageHeader, Table, Button, Modal, Spinner } from '../../../components/ui/index';

export default function FeeHeads() {
  const { data: heads,      loading,   refetch } = useFetch(getFeeHeads);
  const { data: categories }                     = useFetch(getFeeCategories);
  const [modal,  setModal]  = useState(false);
  const [saving, setSaving] = useState(false);
  const [form,   setForm]   = useState({ name: '', category: '', amount: '', isOptional: false });

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createFeeHead(form);
      toast.success('Fee head created');
      setModal(false);
      setForm({ name: '', category: '', amount: '', isOptional: false });
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const columns = [
    { key: 'name',       label: 'Name',      render: r => <strong>{r.name}</strong> },
    { key: 'category',   label: 'Category',  render: r => r.category?.name || '—' },
    { key: 'amount',     label: 'Amount',    render: r => `₹${(r.amount||0).toLocaleString()}` },
    { key: 'isOptional', label: 'Optional',  render: r => r.isOptional ? 'Yes' : 'No' },
  ];

  return (
    <div className="page">
      <PageHeader title="Fee Heads" subtitle="Manage individual fee heads"
        action={<Button onClick={() => setModal(true)}>+ Add Fee Head</Button>} />
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={heads} emptyIcon="💵" emptyTitle="No fee heads" />}
        </div>
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title="Add Fee Head"
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="head-form" type="submit" loading={saving}>Save</Button>
        </>}>
        <form id="head-form" onSubmit={handleSave}>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Name</label>
              <input className="form-control" required value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label required">Amount (₹)</label>
              <input type="number" className="form-control" required value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Category</label>
            <select className="form-control" value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              <option value="">— Select Category —</option>
              {(categories || []).map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.isOptional}
                onChange={e => setForm(f => ({ ...f, isOptional: e.target.checked }))} />
              Optional fee head
            </label>
          </div>
        </form>
      </Modal>
    </div>
  );
}
