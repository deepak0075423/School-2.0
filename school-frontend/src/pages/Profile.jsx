import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/axios';
import { Button, Spinner } from '../components/ui/index';

const PROFILE_ICONS = [
  { key: '🧑‍💼', label: 'Professional' },
  { key: '👨‍🏫', label: 'Teacher M' },
  { key: '👩‍🏫', label: 'Teacher F' },
  { key: '👨‍🎓', label: 'Graduate M' },
  { key: '👩‍🎓', label: 'Graduate F' },
  { key: '🧑‍💻', label: 'Developer' },
  { key: '🦁',   label: 'Lion' },
  { key: '🐼',   label: 'Panda' },
  { key: '🦊',   label: 'Fox' },
  { key: '🦋',   label: 'Butterfly' },
  { key: '🐯',   label: 'Tiger' },
  { key: '🦅',   label: 'Eagle' },
  { key: '🦉',   label: 'Owl' },
  { key: '🐬',   label: 'Dolphin' },
  { key: '🌟',   label: 'Star' },
];

const ROLE_COLORS = {
  super_admin:  '#7c3aed',
  school_admin: '#1d4ed8',
  teacher:      '#0f766e',
  student:      '#059669',
  parent:       '#b45309',
};

function Avatar({ user, size = 96 }) {
  const icon  = user?.profileIcon;
  const color = ROLE_COLORS[user?.role] || '#4f46e5';

  if (icon) {
    return (
      <div style={{
        width: size, height: size, borderRadius: '50%', background: `${color}15`,
        border: `3px solid ${color}40`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.45,
      }}>
        {icon}
      </div>
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, color: '#fff', fontWeight: 700,
    }}>
      {user?.name?.[0]?.toUpperCase()}
    </div>
  );
}

export default function Profile() {
  const { user, reload } = useAuth();
  const [tab,      setTab]    = useState('profile');
  const [saving,   setSaving] = useState(false);
  const [pwSaving, setPwSav]  = useState(false);
  const [iconPick, setIconPick] = useState(false);
  const [form, setForm] = useState({
    name:  user?.name  || '',
    phone: user?.phone || '',
  });
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Name is required');
    setSaving(true);
    try {
      await api.put('/profile/update', { name: form.name, phone: form.phone || '' });
      toast.success('Profile updated');
      reload();
    } catch (err) { toast.error(err.response?.data?.message || err.message); }
    finally { setSaving(false); }
  };

  const handleIconSelect = async (icon) => {
    try {
      await api.put('/profile/update', { profileIcon: icon });
      toast.success(icon ? 'Profile icon updated' : 'Profile icon removed');
      setIconPick(false);
      reload();
    } catch (err) { toast.error(err.message); }
  };

  const handlePwChange = async (e) => {
    e.preventDefault();
    if (pwForm.newPassword.length < 8) return toast.error('New password must be at least 8 characters');
    if (pwForm.newPassword !== pwForm.confirm) return toast.error('Passwords do not match');
    setPwSav(true);
    try {
      await api.post('/auth/reset-password', {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      toast.success('Password changed successfully');
      setPwForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) { toast.error(err.response?.data?.message || err.message); }
    finally { setPwSav(false); }
  };

  if (!user) return <div className="loading-page"><Spinner /></div>;

  const roleLabel  = user.role?.replace(/_/g, ' ');
  const badgeColor = ROLE_COLORS[user.role] || '#4f46e5';

  return (
    <div className="page" style={{ maxWidth: 860, margin: '0 auto' }}>

      {/* ── Hero / Avatar banner ── */}
      <div className="card" style={{ marginBottom: 24, overflow: 'hidden' }}>
        <div style={{ height: 100, background: `linear-gradient(135deg, ${badgeColor} 0%, ${badgeColor}99 100%)` }} />

        <div style={{ padding: '0 24px 24px', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginTop: -48 }}>

            {/* Avatar */}
            <div style={{ width: 96, height: 96, borderRadius: '50%', border: '4px solid var(--bg-card)', overflow: 'hidden', background: 'var(--bg-card)', flexShrink: 0 }}>
              <Avatar user={user} size={88} />
            </div>

            <div style={{ paddingBottom: 4 }}>
              <h2 style={{ margin: '0 0 4px', fontSize: '1.3rem' }}>{user.name}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{
                  background: `${badgeColor}20`, color: badgeColor, padding: '2px 10px',
                  borderRadius: 20, fontSize: '.78rem', fontWeight: 600, textTransform: 'capitalize',
                }}>{roleLabel}</span>
                {user.school?.name && (
                  <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>🏫 {user.school.name}</span>
                )}
              </div>
            </div>

            <button
              onClick={() => setIconPick(p => !p)}
              style={{
                marginLeft: 'auto', alignSelf: 'flex-end', marginBottom: 4,
                background: iconPick ? `${badgeColor}15` : 'none',
                border: `1px solid ${iconPick ? badgeColor : 'var(--border)'}`,
                borderRadius: 'var(--radius)', padding: '6px 12px', cursor: 'pointer',
                fontSize: '.82rem', color: iconPick ? badgeColor : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', gap: 6, transition: 'all .15s',
              }}>
              🎨 {iconPick ? 'Close' : 'Change Icon'}
            </button>
          </div>

          {/* Icon picker panel */}
          {iconPick && (
            <div style={{
              marginTop: 16, padding: 16,
              background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
            }}>
              <p style={{ margin: '0 0 12px', fontSize: '.82rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '.05em' }}>
                SELECT A PROFILE ICON
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {PROFILE_ICONS.map(ic => (
                  <button key={ic.key}
                    onClick={() => handleIconSelect(ic.key)}
                    title={ic.label}
                    style={{
                      width: 52, height: 52, borderRadius: '50%',
                      border: `2px solid ${user.profileIcon === ic.key ? badgeColor : 'var(--border)'}`,
                      background: user.profileIcon === ic.key ? `${badgeColor}15` : 'var(--bg-card)',
                      cursor: 'pointer', fontSize: '1.7rem',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all .15s',
                      boxShadow: user.profileIcon === ic.key ? `0 0 0 3px ${badgeColor}30` : 'none',
                    }}>
                    {ic.key}
                  </button>
                ))}
                {user.profileIcon && (
                  <button
                    onClick={() => handleIconSelect('')}
                    title="Remove icon"
                    style={{
                      width: 52, height: 52, borderRadius: '50%', border: '2px dashed var(--border)',
                      background: 'var(--bg)', cursor: 'pointer', fontSize: '.7rem',
                      color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="tabs" style={{ marginBottom: 20 }}>
        {[['profile', '👤 Personal Info'], ['password', '🔒 Change Password']].map(([key, label]) => (
          <button key={key} className={`tab${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {tab === 'profile' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>

          {/* Personal Info */}
          <div className="card">
            <div className="card-header"><h3 style={{ margin: 0 }}>Personal Information</h3></div>
            <div className="card-body">
              <form onSubmit={handleUpdate}>
                <div className="form-group">
                  <label className="form-label required">Full Name</label>
                  <input className="form-control" required value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input type="email" className="form-control" value={user.email} disabled
                    style={{ background: 'var(--bg)', cursor: 'not-allowed', opacity: .7 }} />
                  <span style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>Email cannot be changed</span>
                </div>
                <div className="form-group">
                  <label className="form-label">Phone Number</label>
                  <input type="tel" className="form-control" value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+91 98765 43210" />
                </div>
                <Button type="submit" loading={saving} style={{ width: '100%', justifyContent: 'center' }}>
                  Save Changes
                </Button>
              </form>
            </div>
          </div>

          {/* Account Details */}
          <div className="card">
            <div className="card-header"><h3 style={{ margin: 0 }}>Account Details</h3></div>
            <div className="card-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[
                  { icon: '🎭', label: 'Role',         value: roleLabel, capitalize: true },
                  { icon: '🏫', label: 'School',       value: user.school?.name || '—' },
                  { icon: '📧', label: 'Email',        value: user.email },
                  { icon: '📞', label: 'Phone',        value: user.phone || '—' },
                  { icon: '📅', label: 'Member Since', value: user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : '—' },
                  { icon: '🟢', label: 'Status',       value: user.isActive !== false ? 'Active' : 'Inactive' },
                ].map(({ icon, label, value, capitalize }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '1.1rem', width: 24, textAlign: 'center' }}>{icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
                      <div style={{ fontWeight: 500, textTransform: capitalize ? 'capitalize' : 'none' }}>{value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'password' && (
        <div style={{ maxWidth: 440 }}>
          <div className="card">
            <div className="card-header"><h3 style={{ margin: 0 }}>Change Password</h3></div>
            <div className="card-body">
              <form onSubmit={handlePwChange}>
                <div className="form-group">
                  <label className="form-label required">Current Password</label>
                  <input type="password" className="form-control" required
                    value={pwForm.currentPassword}
                    onChange={e => setPwForm(f => ({ ...f, currentPassword: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label required">New Password</label>
                  <input type="password" className="form-control" required minLength={8}
                    value={pwForm.newPassword}
                    onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))}
                    placeholder="Minimum 8 characters" />
                </div>
                <div className="form-group">
                  <label className="form-label required">Confirm New Password</label>
                  <input type="password" className="form-control" required
                    value={pwForm.confirm}
                    onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} />
                  {pwForm.confirm && pwForm.newPassword !== pwForm.confirm && (
                    <span style={{ fontSize: '.78rem', color: 'var(--danger)', marginTop: 4, display: 'block' }}>
                      Passwords do not match
                    </span>
                  )}
                </div>
                <Button type="submit" loading={pwSaving} style={{ width: '100%', justifyContent: 'center' }}>
                  Change Password
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
