import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { login } from '../../api/auth.api';
import { useAuth } from '../../contexts/AuthContext';

const roleHome = {
  super_admin:  '/super-admin/dashboard',
  school_admin: '/admin/dashboard',
  teacher:      '/teacher/dashboard',
  student:      '/student/dashboard',
  parent:       '/parent/dashboard',
};

export default function Login() {
  const { signIn }   = useAuth();
  const navigate     = useNavigate();
  const [form, setForm]     = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const onChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) return toast.error('Please fill all fields');
    setLoading(true);
    try {
      const res = await login(form);
      signIn(res.token, res.refreshToken, res.user);
      toast.success(`Welcome, ${res.user.name}!`);
      if (res.user.isFirstLogin) navigate('/reset-password');
      else navigate(roleHome[res.user.role] || '/');
    } catch (err) {
      toast.error(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div style={{ fontSize: '3rem', marginBottom: 8 }}>🏫</div>
          <h1>School Management</h1>
          <p>Sign in to your account</p>
        </div>

        <form onSubmit={onSubmit}>
          <div className="form-group">
            <label className="form-label required">Email Address</label>
            <input
              name="email"
              type="email"
              className="form-control"
              placeholder="you@school.com"
              value={form.email}
              onChange={onChange}
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label required">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                name="password"
                type={showPass ? 'text' : 'password'}
                className="form-control"
                placeholder="••••••••"
                value={form.password}
                onChange={onChange}
                autoComplete="current-password"
                style={{ paddingRight: 44 }}
              />
              <button
                type="button"
                onClick={() => setShowPass(s => !s)}
                style={{
                  position: 'absolute', right: 12, top: '50%',
                  transform: 'translateY(-50%)', color: 'var(--text-muted)',
                  fontSize: '1rem', background: 'none', border: 'none', cursor: 'pointer',
                }}
              >
                {showPass ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <div style={{ textAlign: 'right', marginTop: -8, marginBottom: 20 }}>
            <Link to="/forgot-password" style={{ fontSize: '.85rem', color: 'var(--primary)' }}>
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full"
            style={{ width: '100%', justifyContent: 'center', padding: '11px' }}
            disabled={loading}
          >
            {loading ? '⏳ Signing in…' : '🔐 Sign In'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: '.85rem', color: 'var(--text-muted)' }}>
          Protected by School Management System
        </p>
      </div>
    </div>
  );
}
