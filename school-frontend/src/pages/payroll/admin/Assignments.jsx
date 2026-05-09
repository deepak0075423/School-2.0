import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getAssignments, getStructures, assignEmployee } from '../../../api/payroll.api';
import { PageHeader, Table, Button, Modal, Spinner } from '../../../components/ui/index';

export default function PayrollAssignments() {
  const { data: assignments, loading, refetch } = useFetch(getAssignments);
  const { data: structures }                    = useFetch(getStructures);
  const [modal,  setModal]  = useState(false);
  const [saving, setSaving] = useState(false);
  const [form,   setForm]   = useState({ employee: '', structure: '', effectiveFrom: '' });

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await assignEmployee(form);
      toast.success('Structure assigned');
      setModal(false);
      setForm({ employee: '', structure: '', effectiveFrom: '' });
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const columns = [
    { key: 'employee',      label: 'Employee',       render: r => <strong>{r.employee?.name || '—'}</strong> },
    { key: 'structure',     label: 'Structure',      render: r => r.structure?.name || '—' },
    { key: 'effectiveFrom', label: 'Effective From', render: r => r.effectiveFrom ? new Date(r.effectiveFrom).toLocaleDateString() : '—' },
    { key: 'net',           label: 'Net Pay',        render: r => r.structure ? `₹${((r.structure.basic||0)+(r.structure.hra||0)+(r.structure.allowances||0)-(r.structure.deductions||0)).toLocaleString()}` : '—' },
  ];

  return (
    <div className="page">
      <PageHeader title="Salary Assignments" subtitle="Assign structures to employees"
        action={<Button onClick={() => setModal(true)}>+ Assign</Button>} />
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={assignments} emptyIcon="👤" emptyTitle="No assignments" />}
        </div>
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title="Assign Salary Structure"
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="assign-form" type="submit" loading={saving}>Assign</Button>
        </>}>
        <form id="assign-form" onSubmit={handleSave}>
          <div className="form-group">
            <label className="form-label required">Employee ID</label>
            <input className="form-control" required placeholder="Employee user ID" value={form.employee}
              onChange={e => setForm(f => ({ ...f, employee: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label required">Salary Structure</label>
            <select className="form-control" required value={form.structure}
              onChange={e => setForm(f => ({ ...f, structure: e.target.value }))}>
              <option value="">— Select —</option>
              {(structures || []).map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label required">Effective From</label>
            <input type="date" className="form-control" required value={form.effectiveFrom}
              onChange={e => setForm(f => ({ ...f, effectiveFrom: e.target.value }))} />
          </div>
        </form>
      </Modal>
    </div>
  );
}
