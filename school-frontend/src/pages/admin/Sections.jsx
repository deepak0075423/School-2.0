import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { PageHeader, Button, Modal, Spinner, Empty } from '../../components/ui/index';

export default function Sections() {
  const { id }              = useParams();
  const { data, loading, refetch } = useFetch(() => api.getClassDetail(id), [id]);
  const [modal, setModal]   = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm]     = useState({ name: '', capacity: 40 });

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await api.createSection(id, form); toast.success('Section created'); setModal(false); refetch(); }
    catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="loading-page"><Spinner /></div>;

  const cls      = data?.class;
  const sections = data?.sections || [];

  return (
    <div className="page">
      <div className="breadcrumb">
        <Link to="/admin/classes">Classes</Link>
        <span>›</span>
        <span>{cls?.className}</span>
      </div>

      <PageHeader title={`${cls?.className || 'Class'} — Sections`}
        subtitle={`${sections.length} section${sections.length !== 1 ? 's' : ''}`}
        action={<Button onClick={() => setModal(true)}>+ Add Section</Button>} />

      {!sections.length
        ? <Empty icon="🏛️" title="No sections yet" action={<Button onClick={() => setModal(true)}>Create Section</Button>} />
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16 }}>
            {sections.map(sec => (
              <div key={sec._id} className="card">
                <div className="card-body" style={{ textAlign: 'center', padding: '20px 16px' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 8 }}>📋</div>
                  <h3 style={{ marginBottom: 4 }}>Section {sec.sectionName}</h3>
                  <p style={{ fontSize: '.85rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                    Capacity: {sec.maxStudents ?? sec.capacity ?? 40}
                  </p>
                  <p style={{ fontSize: '.85rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                    Students: {sec.currentCount ?? 0}
                  </p>
                  <Link to={`/admin/sections/${sec._id}`} className="btn btn-primary btn-sm">Manage</Link>
                </div>
              </div>
            ))}
          </div>
        )
      }

      <Modal open={modal} onClose={() => setModal(false)} title="Add Section"
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="section-form" type="submit" loading={saving}>Create</Button>
        </>}>
        <form id="section-form" onSubmit={handleCreate}>
          <div className="form-group">
            <label className="form-label required">Section Name</label>
            <input className="form-control" required value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="A" />
          </div>
          <div className="form-group">
            <label className="form-label">Capacity</label>
            <input type="number" className="form-control" value={form.capacity}
              onChange={e => setForm(f => ({ ...f, capacity: +e.target.value }))} />
          </div>
        </form>
      </Modal>
    </div>
  );
}
