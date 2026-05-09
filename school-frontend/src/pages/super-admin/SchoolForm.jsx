import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../api/superAdmin.api';
import { PageHeader, Button, Card } from '../../components/ui/index';

const initial = {
  name: '', code: '', email: '', phone: '',
  address: '', city: '', state: '', country: 'India',
  website: '', isActive: true,
};

const REQUIRED_FIELDS = ['name', 'code', 'email', 'phone', 'address', 'city', 'state', 'country'];
const FIELD_LABELS = {
  name: 'School Name', code: 'School Code', email: 'Email', phone: 'Phone',
  address: 'Address', city: 'City', state: 'State', country: 'Country',
};

function validate(form) {
  for (const field of REQUIRED_FIELDS) {
    if (!form[field]?.trim()) return `${FIELD_LABELS[field]} is required`;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Please enter a valid email address';
  if (!/^\+?[\d\s\-()]{7,15}$/.test(form.phone)) return 'Please enter a valid phone number';
  if (form.website && !/^https?:\/\/.+/.test(form.website)) return 'Website must start with http:// or https://';
  return null;
}

export default function SchoolForm() {
  const { id }      = useParams();
  const navigate    = useNavigate();
  const isEdit      = !!id;

  const [form,    setForm]    = useState(initial);
  const [logo,    setLogo]    = useState(null);
  const [preview, setPreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors,  setErrors]  = useState({});

  useEffect(() => {
    if (isEdit) {
      api.getSchool(id)
        .then(res => {
          const s = res.data || res;
          setForm({
            name:     s.name    || '',
            code:     s.code    || '',
            email:    s.email   || '',
            phone:    s.phone   || '',
            address:  s.address || '',
            city:     s.city    || '',
            state:    s.state   || '',
            country:  s.country || 'India',
            website:  s.website || '',
            isActive: s.isActive !== false,
          });
          if (s.logo) setPreview(s.logo);
        })
        .catch(() => toast.error('Failed to load school'));
    }
  }, [id]);

  const onChange = (e) => {
    const { name, value, type, checked } = e.target;
    const val = type === 'checkbox' ? checked : value;
    setForm(f => ({ ...f, [name]: val }));
    if (errors[name]) setErrors(er => ({ ...er, [name]: '' }));
  };

  const onLogoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('File must be an image'); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error('Logo must be under 2 MB'); return; }
    setLogo(file);
    setPreview(URL.createObjectURL(file));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const errMsg = validate(form);
    if (errMsg) {
      toast.error(errMsg);
      // highlight the specific field
      const field = REQUIRED_FIELDS.find(f => !form[f]?.trim()) || 'email';
      setErrors({ [field]: errMsg });
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (logo) fd.append('logo', logo);
      if (isEdit) await api.updateSchool(id, fd);
      else        await api.createSchool(fd);
      toast.success(isEdit ? 'School updated' : 'School created');
      navigate('/super-admin/schools');
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Save failed');
    } finally { setLoading(false); }
  };

  const fieldError = (name) => errors[name]
    ? <span style={{ color: 'var(--danger)', fontSize: '.78rem', marginTop: 4, display: 'block' }}>{errors[name]}</span>
    : null;

  const inp = (name, label, type = 'text', placeholder = '', required = true) => (
    <div className="form-group">
      <label className={`form-label${required ? ' required' : ''}`}>{label}</label>
      <input
        name={name} type={type} className={`form-control${errors[name] ? ' is-invalid' : ''}`}
        value={form[name]} onChange={onChange} placeholder={placeholder}
        required={required}
        style={errors[name] ? { borderColor: 'var(--danger)' } : {}}
      />
      {fieldError(name)}
    </div>
  );

  return (
    <div style={{ padding: 24, maxWidth: 820, margin: '0 auto' }}>
      <PageHeader title={isEdit ? 'Edit School' : 'Add School'}
        subtitle={isEdit ? 'Update school information' : 'Fill all required fields to register a school'} />

      <Card>
        <form onSubmit={onSubmit} noValidate>

          {/* ── Logo ── */}
          <div className="form-group" style={{ marginBottom: 24 }}>
            <label className="form-label">School Logo <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 80, height: 80, borderRadius: 'var(--radius)',
                border: '2px dashed var(--border)', overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--bg)', flexShrink: 0,
              }}>
                {preview
                  ? <img src={preview} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: '2rem' }}>🏫</span>}
              </div>
              <div>
                <input type="file" id="logo-input" accept="image/*" style={{ display: 'none' }} onChange={onLogoChange} />
                <label htmlFor="logo-input" className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                  {preview ? '🔄 Change Logo' : '📷 Upload Logo'}
                </label>
                {preview && !logo && (
                  <button type="button" className="btn btn-secondary btn-sm"
                    style={{ marginLeft: 8 }}
                    onClick={() => { setPreview(''); setLogo(null); }}>
                    ✕ Remove
                  </button>
                )}
                <p className="text-muted text-sm" style={{ marginTop: 4, marginBottom: 0 }}>PNG, JPG or SVG · max 2 MB</p>
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', margin: '0 0 20px' }} />

          {/* ── Basic Info ── */}
          <div style={{ marginBottom: 8, fontWeight: 600, color: 'var(--text-muted)', fontSize: '.8rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            Basic Information
          </div>
          <div className="form-row form-row-2">
            {inp('name', 'School Name', 'text', 'St. Xavier\'s School')}
            {inp('code', 'School Code', 'text', 'SXS001')}
          </div>
          <div className="form-row form-row-2">
            {inp('email', 'Email Address', 'email', 'admin@school.edu.in')}
            {inp('phone', 'Phone Number', 'tel', '+91 98765 43210')}
          </div>

          <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0 20px' }} />

          {/* ── Location ── */}
          <div style={{ marginBottom: 8, fontWeight: 600, color: 'var(--text-muted)', fontSize: '.8rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            Location
          </div>
          <div className="form-group">
            <label className="form-label required">Address</label>
            <textarea name="address" className={`form-control${errors.address ? ' is-invalid' : ''}`}
              rows={2} value={form.address} onChange={onChange} required
              placeholder="Street address, building, landmark"
              style={errors.address ? { borderColor: 'var(--danger)' } : {}} />
            {fieldError('address')}
          </div>
          <div className="form-row form-row-3">
            {inp('city',    'City',    'text', 'Mumbai')}
            {inp('state',   'State',   'text', 'Maharashtra')}
            {inp('country', 'Country', 'text', 'India')}
          </div>

          <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0 20px' }} />

          {/* ── Website & Status ── */}
          <div style={{ marginBottom: 8, fontWeight: 600, color: 'var(--text-muted)', fontSize: '.8rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            Other Details
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Website <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
              <input name="website" type="url" className={`form-control${errors.website ? ' is-invalid' : ''}`}
                value={form.website} onChange={onChange}
                placeholder="https://www.schoolname.edu.in"
                style={errors.website ? { borderColor: 'var(--danger)' } : {}} />
              {fieldError('website')}
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 8, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg)' }}>
                <input type="checkbox" name="isActive" checked={form.isActive} onChange={onChange} />
                <span style={{ fontWeight: 500 }}>Active school</span>
                <span style={{ marginLeft: 'auto', fontSize: '.8rem', color: form.isActive ? 'var(--success)' : 'var(--text-muted)' }}>
                  {form.isActive ? '● Active' : '○ Inactive'}
                </span>
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? '⏳ Saving…' : isEdit ? '💾 Update School' : '+ Create School'}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
