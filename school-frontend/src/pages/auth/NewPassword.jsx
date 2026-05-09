import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { newPassword } from '../../api/auth.api';

export default function NewPassword() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const resetToken = location.state?.resetToken || '';
  const [form, setForm]     = useState({ password: '', confirm: '' });
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (form.password.length < 8) return toast.error('Password must be at least 8 characters');
    if (form.password !== form.confirm) return toast.error('Passwords do not match');
    setLoading(true);
    try {
      await newPassword({ resetToken, password: form.password });
      toast.success('Password reset successfully! Please login.');
      navigate('/login');
    } catch (err) {
      toast.error(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🔒</div>
          <h1>New Password</h1>
          <p>Choose a strong new password</p>
        </div>

        <form onSubmit={onSubmit}>
          <div className="form-group">
            <label className="form-label required">New Password</label>
            <input type="password" className="form-control" placeholder="Min 8 characters"
              value={form.password} onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label required">Confirm Password</label>
            <input type="password" className="form-control" placeholder="Repeat password"
              value={form.confirm} onChange={(e) => setForm(f => ({ ...f, confirm: e.target.value }))} />
          </div>
          <button type="submit" className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: 11 }} disabled={loading}>
            {loading ? '⏳ Saving…' : '💾 Set Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
