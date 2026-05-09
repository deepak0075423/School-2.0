import { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import { getInbox, getSent, markAllRead, markOneRead, clearAll } from '../../api/notifications.api';
import * as saApi from '../../api/superAdmin.api';
import { PageHeader, Button, Badge, Modal, Spinner } from '../../components/ui/index';

const TARGET_LABELS = {
  all_schools:     'All Schools',
  specific_school: 'Specific School',
};

const EMPTY_FORM = {
  title: '', body: '',
  channels: { inApp: true, email: false },
  targetType: 'all_schools',
  targetSchools: [],
};

function SentList({ data, loading }) {
  const items = data || [];
  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>;
  if (!items.length) return (
    <div className="empty-state">
      <div className="empty-icon">📤</div>
      <h3>No sent notifications</h3>
      <p className="text-muted text-sm">Notifications you send will appear here.</p>
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(n => (
        <div key={n._id} style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '14px 16px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '.9rem' }}>{n.title}</strong>
                {n.target?.type && (
                  <Badge variant="info" style={{ fontSize: '.7rem' }}>
                    {TARGET_LABELS[n.target.type] || n.target.type}
                  </Badge>
                )}
                {n.channels?.inApp && <Badge variant="secondary" style={{ fontSize: '.7rem' }}>In-App</Badge>}
                {n.channels?.email && <Badge variant="warning" style={{ fontSize: '.7rem' }}>Email</Badge>}
                {n.recipientCount > 0 && (
                  <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
                    {n.recipientCount} recipient{n.recipientCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {n.body && (
                <p style={{ margin: 0, fontSize: '.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{n.body}</p>
              )}
            </div>
            <span style={{ fontSize: '.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {new Date(n.createdAt).toLocaleString()}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SANotifications() {
  const [tab, setTab] = useState('inbox');

  const { data: inboxData, loading: inboxLoading, refetch: refetchInbox } = useFetch(getInbox);
  const { data: sentData,  loading: sentLoading,  refetch: refetchSent  } = useFetch(getSent);

  const [sendOpen, setSendOpen] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [form,     setForm]     = useState(EMPTY_FORM);
  const [schools,  setSchools]  = useState([]);
  const [detail,   setDetail]   = useState(null);

  const receipts = inboxData?.data || inboxData || [];
  const unread   = typeof inboxData?.unread === 'number' ? inboxData.unread : receipts.filter(r => !r.isRead).length;

  const loadSchools = async () => {
    if (schools.length) return;
    try {
      const res = await saApi.getSchools();
      setSchools(res?.data || res || []);
    } catch {}
  };

  const openSend = () => {
    setForm(EMPTY_FORM);
    loadSchools();
    setSendOpen(true);
  };

  const handleMarkAll  = async () => {
    try { await markAllRead(); toast.success('All marked as read'); refetchInbox(); }
    catch (err) { toast.error(err.message); }
  };
  const handleClearAll = async () => {
    try { await clearAll(); toast.success('Inbox cleared'); refetchInbox(); }
    catch (err) { toast.error(err.message); }
  };
  const handleClickReceipt = async (r) => {
    const n = r.notification || r;
    setDetail({ receipt: r, notification: n });
    if (!r.isRead) {
      try { await markOneRead(r._id); refetchInbox(); } catch {}
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error('Title is required');
    if (!form.body.trim())  return toast.error('Message body is required');
    if (!form.channels.inApp && !form.channels.email) return toast.error('Select at least one channel');
    if (form.targetType === 'specific_school' && !form.targetSchools.length)
      return toast.error('Please select at least one school');

    setSaving(true);
    try {
      await saApi.sendNotification({
        title:         form.title.trim(),
        body:          form.body.trim(),
        channels:      form.channels,
        targetType:    form.targetType,
        targetSchools: form.targetSchools,
      });
      toast.success('Notification sent');
      setSendOpen(false);
      setForm(EMPTY_FORM);
      refetchSent();
    } catch (err) { toast.error(err.response?.data?.message || err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="page">
      <PageHeader title="Notifications" subtitle="Send & manage notifications"
        action={<Button onClick={openSend}>+ Send Notification</Button>} />

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 20 }}>
        <button className={`tab${tab === 'inbox' ? ' active' : ''}`} onClick={() => setTab('inbox')}>
          📥 Inbox{unread > 0 && (
            <span style={{ marginLeft: 6, background: 'var(--primary)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: '.72rem', fontWeight: 700 }}>
              {unread}
            </span>
          )}
        </button>
        <button className={`tab${tab === 'sent' ? ' active' : ''}`} onClick={() => setTab('sent')}>
          📤 Sent{sentData?.length > 0 && (
            <span style={{ marginLeft: 6, background: 'var(--text-muted)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: '.72rem' }}>
              {sentData.length}
            </span>
          )}
        </button>
      </div>

      {/* Inbox */}
      {tab === 'inbox' && (
        <>
          {receipts.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <Button variant="secondary" onClick={handleMarkAll}>Mark all read</Button>
              <Button variant="secondary" onClick={handleClearAll}>Clear inbox</Button>
            </div>
          )}
          {inboxLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
          ) : receipts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🔔</div>
              <h3>No notifications</h3>
              <p className="text-muted text-sm">Your inbox is empty.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {receipts.map(r => {
                const n = r.notification || r;
                return (
                  <div key={r._id}
                    onClick={() => handleClickReceipt(r)}
                    style={{
                      background: r.isRead ? 'var(--bg-card)' : '#eef2ff',
                      border: `1px solid ${r.isRead ? 'var(--border)' : '#c7d2fe'}`,
                      borderRadius: 'var(--radius)', padding: '14px 16px',
                      cursor: 'pointer',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
                    }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        {!r.isRead && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0 }} />}
                        <strong style={{ fontSize: '.9rem' }}>{n.title}</strong>
                      </div>
                      {n.body && <p style={{ margin: 0, fontSize: '.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{n.body}</p>}
                      <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 6 }}>
                        {new Date(r.createdAt || n.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === 'sent' && <SentList data={sentData} loading={sentLoading} />}

      {/* Detail popup */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Notification">
        {detail && (
          <div>
            <h3 style={{ margin: '0 0 12px', fontSize: '1.05rem' }}>{detail.notification?.title}</h3>
            <p style={{ margin: '0 0 16px', lineHeight: 1.7, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
              {detail.notification?.body}
            </p>
            <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
              {new Date(detail.receipt?.createdAt || detail.notification?.createdAt).toLocaleString()}
            </div>
          </div>
        )}
      </Modal>

      {/* Send Notification Modal */}
      <Modal open={sendOpen} onClose={() => setSendOpen(false)} title="Send Notification"
        footer={<>
          <Button variant="secondary" onClick={() => setSendOpen(false)}>Cancel</Button>
          <Button form="sa-notif-form" type="submit" loading={saving}>Send</Button>
        </>}>
        <form id="sa-notif-form" onSubmit={handleSend}>

          <div className="form-group">
            <label className="form-label required">Subject / Title</label>
            <input className="form-control" required autoFocus
              value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. System Maintenance Notice" />
          </div>

          <div className="form-group">
            <label className="form-label required">Message Body</label>
            <textarea className="form-control" rows={4} required
              value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              placeholder="Write your message here…" />
          </div>

          {/* Channels */}
          <div className="form-group">
            <label className="form-label">Notification Channels</label>
            <div style={{ display: 'flex', gap: 24, paddingTop: 6 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '.9rem', userSelect: 'none' }}>
                <input type="checkbox" checked={form.channels.inApp}
                  onChange={e => setForm(f => ({ ...f, channels: { ...f.channels, inApp: e.target.checked } }))} />
                In-App Notification
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '.9rem', userSelect: 'none' }}>
                <input type="checkbox" checked={form.channels.email}
                  onChange={e => setForm(f => ({ ...f, channels: { ...f.channels, email: e.target.checked } }))} />
                Email
              </label>
            </div>
          </div>

          {/* Send To — school admins only */}
          <div className="form-group">
            <label className="form-label required">Send To</label>
            <select className="form-control" value={form.targetType}
              onChange={e => setForm(f => ({ ...f, targetType: e.target.value, targetSchools: [] }))}>
              <option value="all_schools">All School Admins</option>
              <option value="specific_school">Specific School Admin(s)</option>
            </select>
          </div>

          {/* School multi-select (conditional) */}
          {form.targetType === 'specific_school' && (
            <div className="form-group">
              <label className="form-label required">Select School(s)</label>
              <select className="form-control" multiple size={Math.min(schools.length || 4, 6)}
                value={form.targetSchools}
                onChange={e => {
                  const selected = Array.from(e.target.selectedOptions, o => o.value);
                  setForm(f => ({ ...f, targetSchools: selected }));
                }}>
                {schools.map(s => (
                  <option key={s._id} value={s._id}>{s.name}</option>
                ))}
              </select>
              <p className="text-muted text-sm" style={{ marginTop: 4 }}>Hold Ctrl / Cmd to select multiple schools.</p>
            </div>
          )}

        </form>
      </Modal>
    </div>
  );
}
