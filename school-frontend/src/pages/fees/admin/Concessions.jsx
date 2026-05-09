import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getConcessions, createConcession } from '../../../api/fees.api';
import { PageHeader, Table, Button, Modal, Badge, Spinner } from '../../../components/ui/index';

export default function Concessions() {
  const { data: concessions, loading, refetch } = useFetch(getConcessions);
  const [modal,  setModal]  = useState(false);
  const [saving, setSaving] = useState(false);
  const [form,   setForm]   = useState({ name: '', type: 'fixed', value: '', reason: '' });

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createConcession(form);
      toast.success('Concession created');
      setModal(false);
      setForm({ name: '', type: 'fixed', value: '', reason: '' });
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const columns = [
    { key: 'name',   label: 'Name',   render: r => <strong>{r.name}</strong> },
    { key: 'type',   label: 'Type',   render: r => <Badge variant="info">{r.type}</Badge> },
    { key: 'value',  label: 'Value',  render: r => r.type === 'percentage' ? `${r.value}%` : `₹${(r.value||0).toLocaleString()}` },
    { key: 'reason', label: 'Reason', render: r => r.reason || '—' },
  ];

  return (
    <div className="page">
      <PageHeader title="Concessions" subtitle="Manage fee concessions and waivers"
        action={<Button onClick={() => setModal(true)}>+ Add Concession</Button>} />
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={concessions} emptyIcon="🎁" emptyTitle="No concessions" />}
        </div>
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title="Add Concession"
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="conc-form" type="submit" loading={saving}>Save</Button>
        </>}>
        <form id="conc-form" onSubmit={handleSave}>
          <div className="form-group">
            <label className="form-label required">Name</label>
            <input className="form-control" required value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-control" value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="fixed">Fixed (₹)</option>
                <option value="percentage">Percentage (%)</option>
                <option value="full">Full Waiver</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Value</label>
              <input type="number" className="form-control" value={form.value}
                onChange={e => setForm(f => ({ ...f, value: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Reason</label>
            <input className="form-control" value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
          </div>
        </form>
      </Modal>
    </div>
  );
}
