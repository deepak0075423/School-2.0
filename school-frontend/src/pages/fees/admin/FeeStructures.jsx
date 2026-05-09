import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getFeeStructures, createFeeStructure } from '../../../api/fees.api';
import { PageHeader, Table, Button, Modal, Badge, Spinner } from '../../../components/ui/index';

export default function FeeStructures() {
  const { data: structures, loading, refetch } = useFetch(getFeeStructures);
  const [modal,  setModal]  = useState(false);
  const [saving, setSaving] = useState(false);
  const [form,   setForm]   = useState({ name: '', class: '', academicYear: '', totalAmount: '' });

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createFeeStructure(form);
      toast.success('Structure created');
      setModal(false);
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const columns = [
    { key: 'name',         label: 'Structure',      render: r => <strong>{r.name}</strong> },
    { key: 'class',        label: 'Class',          render: r => r.class?.name || '—' },
    { key: 'academicYear', label: 'Academic Year',  render: r => r.academicYear?.name || '—' },
    { key: 'totalAmount',  label: 'Total (₹)',      render: r => `₹${(r.totalAmount||0).toLocaleString()}` },
    { key: 'isActive',     label: 'Status',         render: r => <Badge variant={r.isActive ? 'success' : 'muted'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
  ];

  return (
    <div className="page">
      <PageHeader title="Fee Structures" subtitle="Class-wise fee structures"
        action={<Button onClick={() => setModal(true)}>+ Add Structure</Button>} />
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={structures} emptyIcon="🏗️" emptyTitle="No fee structures" />}
        </div>
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title="Add Fee Structure"
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="struct-form" type="submit" loading={saving}>Save</Button>
        </>}>
        <form id="struct-form" onSubmit={handleSave}>
          <div className="form-group">
            <label className="form-label required">Name</label>
            <input className="form-control" required value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Class ID</label>
              <input className="form-control" placeholder="Class ID" value={form.class}
                onChange={e => setForm(f => ({ ...f, class: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Total Amount (₹)</label>
              <input type="number" className="form-control" value={form.totalAmount}
                onChange={e => setForm(f => ({ ...f, totalAmount: e.target.value }))} />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
