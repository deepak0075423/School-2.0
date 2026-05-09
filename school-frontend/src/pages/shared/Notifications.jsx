import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getAllNotifications, markAllRead, markOneRead } from '../../api/notifications.api';
import { PageHeader, Button, Spinner, Modal } from '../../components/ui/index';

export default function Notifications() {
  const [receipts,  setReceipts]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [unread,    setUnread]    = useState(0);
  const [detail,    setDetail]    = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAllNotifications();
      setReceipts(res.data || []);
      setUnread(res.unread ?? 0);
    } catch {
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleMarkAll = async () => {
    try {
      await markAllRead();
      toast.success('All marked as read');
      load();
    } catch (err) { toast.error(err.message); }
  };

  const handleClickReceipt = async (r) => {
    const n = r.notification || r;
    setDetail({ receipt: r, notification: n });
    if (!r.isRead) {
      try {
        await markOneRead(r._id);
        setReceipts(prev => prev.map(x => x._id === r._id ? { ...x, isRead: true } : x));
        setUnread(prev => Math.max(0, prev - 1));
      } catch {}
    }
  };

  return (
    <div className="page">
      <PageHeader title="Notifications" subtitle="All notifications sent to you"
        action={unread > 0 ? <Button variant="secondary" onClick={handleMarkAll}>Mark all read</Button> : null}
      />

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
      ) : receipts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔔</div>
          <h3>No notifications</h3>
          <p className="text-muted text-sm">You haven't received any notifications yet.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {receipts.map(r => {
            const n = r.notification || r;
            if (!n) return null;
            return (
              <div key={r._id}
                onClick={() => handleClickReceipt(r)}
                style={{
                  background: r.isRead ? 'var(--bg-card)' : '#eef2ff',
                  border: `1px solid ${r.isRead ? 'var(--border)' : '#c7d2fe'}`,
                  borderRadius: 'var(--radius)', padding: '14px 16px',
                  cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
                  transition: 'box-shadow .15s',
                }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.08)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    {!r.isRead && (
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0 }} />
                    )}
                    <strong style={{ fontSize: '.9rem' }}>{n.title}</strong>
                  </div>
                  {n.body && (
                    <p style={{ margin: 0, fontSize: '.85rem', color: 'var(--text-muted)', lineHeight: 1.5,
                      overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {n.body}
                    </p>
                  )}
                  <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 6 }}>
                    {new Date(r.createdAt || n.createdAt).toLocaleString()}
                  </div>
                </div>
                <span style={{ fontSize: '.75rem', color: r.isRead ? 'var(--text-muted)' : 'var(--primary)',
                  fontWeight: r.isRead ? 400 : 600, flexShrink: 0, paddingTop: 2 }}>
                  {r.isRead ? 'Read' : 'Unread'}
                </span>
              </div>
            );
          })}
        </div>
      )}

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
    </div>
  );
}
