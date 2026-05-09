import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getFineRules, createFineRule } from '../../../api/fees.api';
import { PageHeader, Table, Button, Modal, Badge, Spinner } from '../../../components/ui/index';

export default function FineRules() {
  const { data: rules, loading, refetch } = useFetch(getFineRules);
  const [modal,  setModal]  = useState(false);
  const [saving, setSaving] = useState(false);
  const [form,   setForm]   = useState({ name: '', type: 'fixed', amount: '', gracePeriod: 0 });

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createFineRule(form);
      toast.success('Fine rule created');
      setModal(false);
      setForm({ name: '', type: 'fixed', amount: '', gracePeriod: 0 });
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const columns = [
    { key: 'name',        label: 'Rule Name',    render: r => <strong>{r.name}</strong> },
    { key: 'type',        label: 'Type',         render: r => <Badge variant="info">{r.type}</Badge> },
    { key: 'amount',      label: 'Amount',       render: r => `₹${(r.amount||0).toLocaleString()}` },
    { key: 'gracePeriod', label: 'Grace (days)', render: r => r.gracePeriod || 0 },
    { key: 'isActive',    label: 'Active',       render: r => <Badge variant={r.isActive ? 'success' : 'muted'}>{r.isActive ? 'Yes' : 'No'}</Badge> },
  ];

  return (
    <div className="page">
      <PageHeader title="Fine Rules" subtitle="Late payment fine configuration"
        action={<Button onClick={() => setModal(true)}>+ Add Rule</Button>} />
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={rules} emptyIcon="⚖️" emptyTitle="No fine rules" />}
        </div>
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title="Add Fine Rule"
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="fine-form" type="submit" loading={saving}>Save</Button>
        </>}>
        <form id="fine-form" onSubmit={handleSave}>
          <div className="form-group">
            <label className="form-label required">Rule Name</label>
            <input className="form-control" required value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-control" value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="fixed">Fixed</option>
                <option value="percentage">Percentage</option>
                <option value="daily">Daily</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label required">Amount</label>
              <input type="number" className="form-control" required value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Grace Period (days)</label>
            <input type="number" className="form-control" min={0} value={form.gracePeriod}
              onChange={e => setForm(f => ({ ...f, gracePeriod: +e.target.value }))} />
          </div>
        </form>
      </Modal>
    </div>
  );
}
