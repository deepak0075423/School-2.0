import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { PageHeader, Table, Button, Modal, Confirm, Spinner, Badge } from '../../components/ui/index';

export default function Holidays() {
  const { data: holidays, loading, refetch } = useFetch(api.getHolidays);
  const [modal, setModal]   = useState(false);
  const [del, setDel]       = useState(null);
  const [saving, setSaving] = useState(false);
  const [delLoad, setDL]    = useState(false);
  const [form, setForm]     = useState({ name: '', date: '', type: 'public', description: '' });

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await api.createHoliday(form); toast.success('Holiday added'); setModal(false); refetch(); }
    catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDL(true);
    try { await api.deleteHoliday(del._id); toast.success('Deleted'); setDel(null); refetch(); }
    catch (err) { toast.error(err.message); }
    finally { setDL(false); }
  };

  const typeColor = { public: 'success', optional: 'warning', school: 'info' };

  const columns = [
    { key: 'name',   label: 'Holiday', render: r => <strong>{r.name}</strong> },
    { key: 'date',   label: 'Date',    render: r => r.date ? new Date(r.date).toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) : '—' },
    { key: 'type',   label: 'Type',    render: r => <Badge variant={typeColor[r.type] || 'info'}>{r.type}</Badge> },
    { key: 'description', label: 'Description', render: r => <span className="text-muted text-sm">{r.description}</span> },
    { key: 'actions',label: '',        render: r => (
      <div className="actions">
        <button className="btn btn-danger btn-sm" onClick={() => setDel(r)}>Delete</button>
      </div>
    )},
  ];

  if (loading) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page">
      <PageHeader title="Holidays" subtitle={`${holidays?.length ?? 0} holidays this year`}
        action={<Button onClick={() => setModal(true)}>+ Add Holiday</Button>} />

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <Table columns={columns} data={holidays} emptyIcon="🎉" emptyTitle="No holidays configured" />
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Add Holiday"
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="holiday-form" type="submit" loading={saving}>Add</Button>
        </>}>
        <form id="holiday-form" onSubmit={handleCreate}>
          <div className="form-group">
            <label className="form-label required">Holiday Name</label>
            <input className="form-control" required value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Diwali" />
          </div>
          <div className="form-group">
            <label className="form-label required">Date</label>
            <input type="date" className="form-control" required value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Type</label>
            <select className="form-control" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              <option value="public">Public Holiday</option>
              <option value="optional">Optional Holiday</option>
              <option value="school">School Event</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-control" rows={2} value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
        </form>
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={handleDelete}
        loading={delLoad} title="Delete Holiday" message={`Delete "${del?.name}"?`} />
    </div>
  );
}
