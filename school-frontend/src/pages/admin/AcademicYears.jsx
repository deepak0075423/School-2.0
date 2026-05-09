import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { PageHeader, Table, Badge, Button, Modal, Confirm, Spinner } from '../../components/ui/index';

export default function AcademicYears() {
  const { data: years, loading, refetch } = useFetch(api.getAcademicYears);
  const [modal, setModal]     = useState(false);
  const [editYr, setEditYr]   = useState(null);
  const [del, setDel]         = useState(null);
  const [saving, setSaving]   = useState(false);
  const [delLoad, setDL]      = useState(false);
  const [form, setForm]       = useState({ yearName: '', startDate: '', endDate: '' });

  const openCreate = () => { setForm({ yearName: '', startDate: '', endDate: '' }); setEditYr(null); setModal(true); };
  const openEdit   = (r)  => { setForm({ yearName: r.yearName, startDate: r.startDate?.slice(0,10) || '', endDate: r.endDate?.slice(0,10) || '' }); setEditYr(r); setModal(true); };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editYr) {
        await api.updateAcademicYear(editYr._id, form);
        toast.success('Year updated');
      } else {
        await api.createAcademicYear(form);
        toast.success('Year created');
      }
      setModal(false);
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDL(true);
    try { await api.deleteAcademicYear(del._id); toast.success('Deleted'); setDel(null); refetch(); }
    catch (err) { toast.error(err.message); }
    finally { setDL(false); }
  };

  const handleSetActive = async (id) => {
    try { await api.setActiveYear(id); toast.success('Set as active year'); refetch(); }
    catch (err) { toast.error(err.message); }
  };

  const columns = [
    { key: 'yearName',  label: 'Year',   render: r => <strong>{r.yearName}</strong> },
    { key: 'startDate', label: 'Start',  render: r => r.startDate ? new Date(r.startDate).toLocaleDateString() : '—' },
    { key: 'endDate',   label: 'End',    render: r => r.endDate   ? new Date(r.endDate).toLocaleDateString()   : '—' },
    { key: 'status',    label: 'Status', render: r =>
      <Badge variant={r.status === 'active' ? 'success' : 'muted'}>{r.status === 'active' ? '✓ Active' : 'Inactive'}</Badge> },
    { key: 'actions', label: 'Actions', render: r => (
      <div className="actions">
        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Edit</button>
        {r.status !== 'active' && <button className="btn btn-primary btn-sm" onClick={() => handleSetActive(r._id)}>Set Active</button>}
        <button className="btn btn-danger btn-sm" onClick={() => setDel(r)}>Delete</button>
      </div>
    )},
  ];

  if (loading) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page">
      <PageHeader title="Academic Years" subtitle="Manage school academic years"
        action={<Button onClick={openCreate}>+ Add Year</Button>} />

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <Table columns={columns} data={years} emptyIcon="📅" emptyTitle="No academic years" />
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editYr ? 'Edit Academic Year' : 'Add Academic Year'}
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="year-form" type="submit" loading={saving}>{editYr ? 'Update' : 'Create'}</Button>
        </>}>
        <form id="year-form" onSubmit={handleSave}>
          <div className="form-group">
            <label className="form-label required">Year Name</label>
            <input className="form-control" required value={form.yearName}
              onChange={e => setForm(f => ({ ...f, yearName: e.target.value }))} placeholder="2024-25" />
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Start Date</label>
              <input type="date" className="form-control" value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">End Date</label>
              <input type="date" className="form-control" value={form.endDate}
                onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
            </div>
          </div>
        </form>
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={handleDelete}
        loading={delLoad} title="Delete Academic Year" message={`Delete "${del?.yearName}"?`} />
    </div>
  );
}
