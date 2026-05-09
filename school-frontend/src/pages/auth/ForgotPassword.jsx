import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { forgotPassword } from '../../api/auth.api';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!email) return toast.error('Please enter your email');
    setLoading(true);
    try {
      await forgotPassword({ email });
      toast.success('OTP sent to your email');
      navigate('/verify-otp', { state: { email } });
    } catch (err) {
      toast.error(err.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🔑</div>
          <h1>Forgot Password</h1>
          <p>We'll send an OTP to your registered email</p>
        </div>

        <form onSubmit={onSubmit}>
          <div className="form-group">
            <label className="form-label required">Email Address</label>
            <input
              type="email"
              className="form-control"
              placeholder="you@school.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </div>

          <button type="submit" className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: 11 }}
            disabled={loading}>
            {loading ? '⏳ Sending…' : '📧 Send OTP'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: '.85rem' }}>
          <Link to="/login" style={{ color: 'var(--primary)' }}>← Back to login</Link>
        </p>
      </div>
    </div>
  );
}
