import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { verifyOtp } from '../../api/auth.api';

export default function VerifyOtp() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const email     = location.state?.email || '';
  const [otp, setOtp]         = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) return toast.error('Enter the 6-digit OTP');
    setLoading(true);
    try {
      const res = await verifyOtp({ email, otp });
      toast.success('OTP verified');
      navigate('/new-password', { state: { resetToken: res.resetToken } });
    } catch (err) {
      toast.error(err.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📲</div>
          <h1>Enter OTP</h1>
          <p>OTP sent to <strong>{email}</strong></p>
        </div>

        <form onSubmit={onSubmit}>
          <div className="form-group">
            <label className="form-label required">6-Digit OTP</label>
            <input
              type="text"
              className="form-control"
              placeholder="000000"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoFocus
              style={{ letterSpacing: '0.3em', fontSize: '1.3rem', textAlign: 'center' }}
            />
          </div>

          <button type="submit" className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: 11 }}
            disabled={loading}>
            {loading ? '⏳ Verifying…' : '✅ Verify OTP'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: '.85rem' }}>
          <Link to="/forgot-password" style={{ color: 'var(--primary)' }}>← Resend OTP</Link>
        </p>
      </div>
    </div>
  );
}
