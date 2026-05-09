import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { logout } from '../../api/auth.api';
import { getInbox, getUnreadCount, markAllRead, markOneRead, clearAll } from '../../api/notifications.api';
import toast from 'react-hot-toast';
import { Modal } from '../ui/index';

function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch {}
}

function requestBrowserPush(title, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' });
  } else if (Notification.permission === 'default') {
    Notification.requestPermission().then(p => {
      if (p === 'granted') new Notification(title, { body, icon: '/favicon.ico' });
    });
  }
}

export default function Header({ onMenuClick, onCollapseClick }) {
  const { user, signOut }   = useAuth();
  const navigate            = useNavigate();

  const [dropOpen,   setDropOpen]   = useState(false);
  const [bellOpen,   setBellOpen]   = useState(false);
  const [notifs,     setNotifs]     = useState([]);
  const [notifLoad,  setNotifLoad]  = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [detailNotif, setDetailNotif] = useState(null);

  const dropRef      = useRef(null);
  const bellRef      = useRef(null);
  const prevUnread   = useRef(0);
  const pollTimer    = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target))  setDropOpen(false);
      if (bellRef.current && !bellRef.current.contains(e.target))  setBellOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;
    try {
      const res = await getUnreadCount();
      const count = res?.count ?? 0;
      if (count > prevUnread.current) {
        playNotifSound();
        requestBrowserPush('New Notification', 'You have a new notification');
      }
      prevUnread.current = count;
      setUnreadCount(count);
    } catch {}
  }, [user]);

  // Start polling on mount
  useEffect(() => {
    fetchUnreadCount();
    pollTimer.current = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(pollTimer.current);
  }, [fetchUnreadCount]);

  const fetchNotifs = async () => {
    setNotifLoad(true);
    try {
      const res = await getInbox();
      const items = (res.data || res || []).slice(0, 10);
      setNotifs(items);
      // Sync unread count with actual items
      const count = items.filter(n => !n.isRead).length;
      prevUnread.current = count;
      setUnreadCount(count);
    } catch {}
    finally { setNotifLoad(false); }
  };

  const openBell = () => {
    setBellOpen(o => {
      if (!o) fetchNotifs();
      return !o;
    });
    setDropOpen(false);
  };

  const handleMarkAll = async () => {
    try { await markAllRead(); fetchNotifs(); fetchUnreadCount(); }
    catch { toast.error('Failed to mark all read'); }
  };

  const handleClearAll = async () => {
    try { await clearAll(); fetchNotifs(); fetchUnreadCount(); }
    catch { toast.error('Failed to clear inbox'); }
  };

  const handleClickNotif = async (receipt) => {
    const n = receipt.notification || receipt;
    setDetailNotif({ receipt, notification: n });
    setBellOpen(false);
    if (!receipt.isRead) {
      try {
        await markOneRead(receipt._id);
        fetchUnreadCount();
        setNotifs(prev => prev.map(r => r._id === receipt._id ? { ...r, isRead: true } : r));
      } catch {}
    }
  };

  const handleLogout = async () => {
    try { await logout(); } catch {}
    signOut();
    navigate('/login');
    toast.success('Logged out successfully');
  };

  const rolePrefix = user?.role === 'super_admin' ? 'super-admin'
    : user?.role === 'school_admin' ? 'admin'
    : user?.role || 'admin';

  const initials = user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="header">
      {/* Mobile hamburger */}
      <button className="header__toggle btn-icon" onClick={onMenuClick}
        style={{ display: 'none' }} id="mobile-menu-btn">☰</button>

      {/* Desktop collapse toggle */}
      <button className="header__toggle btn-icon" onClick={onCollapseClick}
        id="desktop-collapse-btn">☰</button>

      {/* Search */}
      <div className="header__search">
        <span className="header__search-icon">🔍</span>
        <input type="text" placeholder="Search…" />
      </div>

      <div style={{ flex: 1 }} />

      {/* Actions */}
      <div className="header__actions">
        <Link to="/profile" className="header__btn" title="Profile">👤</Link>

        {/* Bell */}
        <div className="dropdown" ref={bellRef}>
          <button className="header__btn" title="Notifications" onClick={openBell}
            style={{ position: 'relative' }}>
            🔔
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: 2, right: 2,
                background: 'var(--danger)', color: '#fff',
                fontSize: '.6rem', fontWeight: 700,
                borderRadius: 99, minWidth: 16, height: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 4px', lineHeight: 1,
              }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {bellOpen && (
            <div className="dropdown-menu" style={{
              right: 0, left: 'auto', width: 340, maxHeight: 460,
              overflow: 'hidden', display: 'flex', flexDirection: 'column',
            }}>
              {/* Header row */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0,
              }}>
                <strong style={{ fontSize: '.9rem' }}>Notifications</strong>
                {notifs.length > 0 && (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <button onClick={handleMarkAll}
                      style={{ background: 'none', border: 'none', color: 'var(--primary)',
                        fontSize: '.78rem', cursor: 'pointer', padding: 0 }}>
                      Mark all read
                    </button>
                    <span style={{ color: 'var(--border)' }}>|</span>
                    <button onClick={handleClearAll}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)',
                        fontSize: '.78rem', cursor: 'pointer', padding: 0 }}>
                      Clear all
                    </button>
                  </div>
                )}
              </div>

              {/* List */}
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {notifLoad ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: '.85rem' }}>
                    Loading…
                  </div>
                ) : notifs.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: '.85rem' }}>
                    No notifications
                  </div>
                ) : notifs.map(r => {
                  const n = r.notification || r;
                  return (
                    <div key={r._id}
                      onClick={() => handleClickNotif(r)}
                      style={{
                        padding: '12px 16px', borderBottom: '1px solid var(--border)',
                        cursor: 'pointer', background: r.isRead ? 'transparent' : '#eef2ff',
                        transition: 'background .15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover, #f1f5f9)'}
                      onMouseLeave={e => e.currentTarget.style.background = r.isRead ? 'transparent' : '#eef2ff'}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        {!r.isRead && (
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0 }} />
                        )}
                        <div style={{ fontWeight: r.isRead ? 400 : 600, fontSize: '.85rem' }}>
                          {n.title}
                        </div>
                      </div>
                      {n.body && (
                        <div style={{ fontSize: '.78rem', color: 'var(--text-muted)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          paddingLeft: r.isRead ? 0 : 13 }}>
                          {n.body}
                        </div>
                      )}
                      <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 4,
                        paddingLeft: r.isRead ? 0 : 13 }}>
                        {new Date(r.createdAt || n.createdAt).toLocaleString()}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
                <Link
                  to={`/${rolePrefix}/notifications`}
                  onClick={() => setBellOpen(false)}
                  style={{ fontSize: '.82rem', color: 'var(--primary)', textDecoration: 'none' }}>
                  View all notifications →
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Avatar dropdown */}
        <div className="dropdown" ref={dropRef}>
          <div className="header__avatar" onClick={() => { setDropOpen(o => !o); setBellOpen(false); }}
            title={user?.name}>
            {user?.profileImage
              ? <img src={user.profileImage} alt="" />
              : initials}
          </div>

          {dropOpen && (
            <div className="dropdown-menu">
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{user?.name}</div>
                <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                  {user?.role?.replace('_', ' ')}
                </div>
              </div>
              <Link to="/profile" className="dropdown-item" onClick={() => setDropOpen(false)}>
                👤 Profile
              </Link>
              <div className="dropdown-divider" />
              <button className="dropdown-item danger" onClick={handleLogout}>
                🚪 Logout
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Notification detail popup */}
      {detailNotif && (
        <Modal open={!!detailNotif} onClose={() => setDetailNotif(null)} title="Notification">
          <div>
            <h3 style={{ margin: '0 0 12px', fontSize: '1.05rem' }}>{detailNotif.notification?.title}</h3>
            <p style={{ margin: '0 0 16px', lineHeight: 1.7, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
              {detailNotif.notification?.body}
            </p>
            <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
              {new Date(detailNotif.receipt?.createdAt || detailNotif.notification?.createdAt).toLocaleString()}
            </div>
          </div>
        </Modal>
      )}

      <style>{`
        @media (max-width: 768px) {
          #mobile-menu-btn    { display: flex !important; }
          #desktop-collapse-btn { display: none !important; }
        }
      `}</style>
    </div>
  );
}
