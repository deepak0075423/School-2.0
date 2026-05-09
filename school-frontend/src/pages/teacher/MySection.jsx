import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import { getMySection, createAnnouncement, deleteAnnouncement } from '../../api/teacher.api';
import { PageHeader, Button, Modal, Spinner, Card, Confirm } from '../../components/ui/index';

export default function MySection() {
  const { data, loading, refetch } = useFetch(getMySection);
  const [annModal, setAnnModal]   = useState(false);
  const [delAnn, setDelAnn]       = useState(null);
  const [annText, setAnnText]     = useState({ title: '', body: '' });
  const [saving, setSaving]       = useState(false);
  const [delLoad, setDL]          = useState(false);

  const handleAnnouncement = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await createAnnouncement(annText); toast.success('Announcement posted'); setAnnModal(false); setAnnText({ title: '', body: '' }); refetch(); }
    catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleDeleteAnn = async () => {
    setDL(true);
    try { await deleteAnnouncement(delAnn._id); toast.success('Deleted'); setDelAnn(null); refetch(); }
    catch (err) { toast.error(err.message); }
    finally { setDL(false); }
  };

  if (loading) return <div className="loading-page"><Spinner /></div>;
  const { section, announcements, monitors } = data || {};

  return (
    <div className="page">
      <PageHeader title="My Section" subtitle={section ? `${section.class?.name} — Section ${section.name}` : 'No section assigned'} />

      {section ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
          <div>
            <Card title="Announcements"
              action={<Button size="sm" onClick={() => setAnnModal(true)}>+ Post</Button>}>
              {announcements?.length ? announcements.map(a => (
                <div key={a._id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <strong style={{ fontSize: '.95rem' }}>{a.title}</strong>
                    <button className="btn btn-danger btn-sm" onClick={() => setDelAnn(a)}>✕</button>
                  </div>
                  <p style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>{a.body}</p>
                  <span style={{ fontSize: '.75rem', color: 'var(--text-light)' }}>
                    {new Date(a.createdAt).toLocaleString()}
                  </span>
                </div>
              )) : <p className="text-muted" style={{ padding: '24px 0' }}>No announcements yet.</p>}
            </Card>
          </div>

          <div>
            <Card title="Section Info">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  ['Class',    section.class?.name],
                  ['Section',  section.name],
                  ['Capacity', section.capacity],
                ].map(([k,v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="text-muted text-sm">{k}</span>
                    <span style={{ fontWeight: 500 }}>{v || '—'}</span>
                  </div>
                ))}
              </div>
            </Card>

            <div style={{ marginTop: 16 }}>
              <Card title="Class Monitors">
                {monitors?.length ? monitors.map(m => (
                  <div key={m._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                    <div className="avatar avatar-sm">{m.student?.name?.[0]}</div>
                    <span>{m.student?.name}</span>
                  </div>
                )) : <p className="text-muted text-sm">No monitors assigned.</p>}
              </Card>
            </div>
          </div>
        </div>
      ) : (
        <div className="alert alert-warning">No section has been assigned to you yet.</div>
      )}

      <Modal open={annModal} onClose={() => setAnnModal(false)} title="Post Announcement"
        footer={<>
          <Button variant="secondary" onClick={() => setAnnModal(false)}>Cancel</Button>
          <Button form="ann-form" type="submit" loading={saving}>Post</Button>
        </>}>
        <form id="ann-form" onSubmit={handleAnnouncement}>
          <div className="form-group">
            <label className="form-label required">Title</label>
            <input className="form-control" required value={annText.title}
              onChange={e => setAnnText(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label required">Message</label>
            <textarea className="form-control" rows={4} required value={annText.body}
              onChange={e => setAnnText(f => ({ ...f, body: e.target.value }))} />
          </div>
        </form>
      </Modal>

      <Confirm open={!!delAnn} onClose={() => setDelAnn(null)} onConfirm={handleDeleteAnn}
        loading={delLoad} title="Delete Announcement" message="Remove this announcement?" />
    </div>
  );
}
