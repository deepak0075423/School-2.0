import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { resetPassword } from '../../api/auth.api';
import { useAuth } from '../../contexts/AuthContext';

export default function ResetPassword() {
  const navigate = useNavigate();
  const { user, reload } = useAuth();
  const [form, setForm]       = useState({ newPassword: '', confirm: '' });
  const [loading, setLoading] = useState(false);

  const isFirst = user?.isFirstLogin !== false; // true for first-login, fallback safe

  const onSubmit = async (e) => {
    e.preventDefault();
    if (form.newPassword.length < 8) return toast.error('Minimum 8 characters required');
    if (form.newPassword !== form.confirm) return toast.error('Passwords do not match');
    setLoading(true);
    try {
      await resetPassword({ newPassword: form.newPassword });
      toast.success('Password set! Please log in again.');
      await reload();
      navigate('/login');
    } catch (err) {
      toast.error(err.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🔐</div>
          <h1>Set Your Password</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '.9rem' }}>
            {isFirst
              ? 'You logged in with a one-time password. Set a permanent password to continue.'
              : 'Choose a new password for your account.'}
          </p>
        </div>

        {isFirst && (
          <div className="alert alert-warning" style={{ marginBottom: 20, fontSize: '.85rem' }}>
            This is your first login. You must set a new password before you can access the system.
          </div>
        )}

        <form onSubmit={onSubmit}>
          <div className="form-group">
            <label className="form-label required">New Password</label>
            <input type="password" className="form-control" placeholder="Min 8 characters" autoFocus
              value={form.newPassword} onChange={(e) => setForm(f => ({ ...f, newPassword: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label required">Confirm New Password</label>
            <input type="password" className="form-control" placeholder="Repeat new password"
              value={form.confirm} onChange={(e) => setForm(f => ({ ...f, confirm: e.target.value }))} />
          </div>
          <button type="submit" className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: 11 }} disabled={loading}>
            {loading ? '⏳ Saving…' : '💾 Set Password & Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
