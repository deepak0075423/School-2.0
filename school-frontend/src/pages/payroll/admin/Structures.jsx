import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getStructures, createStructure } from '../../../api/payroll.api';
import { PageHeader, Table, Button, Modal, Spinner } from '../../../components/ui/index';

export default function PayrollStructures() {
  const { data: structures, loading, refetch } = useFetch(getStructures);
  const [modal,  setModal]  = useState(false);
  const [saving, setSaving] = useState(false);
  const [form,   setForm]   = useState({ name: '', basic: '', hra: '', allowances: '', deductions: '' });

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createStructure(form);
      toast.success('Structure created');
      setModal(false);
      setForm({ name: '', basic: '', hra: '', allowances: '', deductions: '' });
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const columns = [
    { key: 'name',        label: 'Structure',   render: r => <strong>{r.name}</strong> },
    { key: 'basic',       label: 'Basic (₹)',   render: r => `₹${(r.basic||0).toLocaleString()}` },
    { key: 'hra',         label: 'HRA (₹)',     render: r => `₹${(r.hra||0).toLocaleString()}` },
    { key: 'allowances',  label: 'Allow. (₹)',  render: r => `₹${(r.allowances||0).toLocaleString()}` },
    { key: 'gross',       label: 'Gross (₹)',   render: r => {
      const g = (r.basic||0)+(r.hra||0)+(r.allowances||0);
      return `₹${g.toLocaleString()}`;
    }},
  ];

  return (
    <div className="page">
      <PageHeader title="Salary Structures" subtitle="Define pay structures"
        action={<Button onClick={() => setModal(true)}>+ Add Structure</Button>} />
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={structures} emptyIcon="🏗️" emptyTitle="No structures" />}
        </div>
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title="Add Salary Structure"
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
            {[['basic','Basic'],['hra','HRA'],['allowances','Allowances'],['deductions','Deductions']].map(([k,label]) => (
              <div className="form-group" key={k}>
                <label className="form-label">{label} (₹)</label>
                <input type="number" className="form-control" value={form[k]}
                  onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
              </div>
            ))}
          </div>
        </form>
      </Modal>
    </div>
  );
}
