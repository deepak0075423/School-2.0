import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { getSchoolSettings, updateSchoolSettings } from '../../api/admin.api';
import { PageHeader, Button, Spinner } from '../../components/ui/index';

const UPLOADS_BASE = 'http://localhost:5000/uploads/images';

const EMPTY = {
  code: '', email: '', phone: '', website: '',
  leaveSettings: {
    saturdayWorking: true,
    saturdayMode: 'all',
    saturdayHalfDay: false,
  },
};

export default function SchoolSettings() {
  const [form,    setForm]    = useState(EMPTY);
  const [name,    setName]    = useState('');
  const [logo,    setLogo]    = useState('');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const logoRef = useRef();

  useEffect(() => {
    getSchoolSettings()
      .then(res => {
        const d = res.data?.data ?? res.data;
        setName(d.name || '');
        setLogo(d.logo || '');
        setForm({
          code:    d.code    || '',
          email:   d.email   || '',
          phone:   d.phone   || '',
          website: d.website || '',
          leaveSettings: {
            saturdayWorking: d.leaveSettings?.saturdayWorking !== false,
            saturdayMode:    d.leaveSettings?.saturdayMode    || 'all',
            saturdayHalfDay: !!d.leaveSettings?.saturdayHalfDay,
          },
        });
      })
      .catch(() => toast.error('Failed to load school settings'))
      .finally(() => setLoading(false));
  }, []);

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
  };

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const setLS = (key, val) => setForm(f => ({
    ...f,
    leaveSettings: { ...f.leaveSettings, [key]: val },
  }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('code',    form.code);
      fd.append('email',   form.email);
      fd.append('phone',   form.phone);
      fd.append('website', form.website);
      fd.append('leaveSettings', JSON.stringify(form.leaveSettings));
      if (logoRef.current?.files?.[0]) fd.append('logo', logoRef.current.files[0]);
      const res = await updateSchoolSettings(fd);
      const d   = res.data?.data ?? res.data;
      setLogo(d.logo || '');
      setPreview(null);
      if (logoRef.current) logoRef.current.value = '';
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="page">
      <div style={{ padding: 64, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
    </div>
  );

  const { saturdayWorking, saturdayMode, saturdayHalfDay } = form.leaveSettings;
  const logoSrc = preview || (logo ? `${UPLOADS_BASE}/${logo}` : null);

  return (
    <div className="page">
      <PageHeader title="School Settings" subtitle="Update your school profile and working-day configuration" />

      <form onSubmit={handleSubmit} style={{ maxWidth: 680 }}>

        {/* ── School Profile ── */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><strong>School Profile</strong></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Logo */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Logo</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {logoSrc ? (
                  <img src={logoSrc} alt="logo" style={{ width: 72, height: 72, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', padding: 4 }} />
                ) : (
                  <div style={{ width: 72, height: 72, borderRadius: 8, border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🏫</div>
                )}
                <div>
                  <input ref={logoRef} type="file" accept="image/*" className="form-control" style={{ maxWidth: 300 }} onChange={handleLogoChange} />
                  <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 4 }}>JPG, PNG, SVG — max 5 MB</div>
                </div>
              </div>
            </div>

            {/* Name (read-only) */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">School Name</label>
              <input className="form-control" value={name} disabled style={{ background: 'var(--bg-muted)', cursor: 'not-allowed' }} />
              <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>Only a super-admin can change the school name.</span>
            </div>

            <div className="form-row form-row-2">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">School Code</label>
                <input className="form-control" value={form.code} onChange={e => set('code', e.target.value)} placeholder="e.g. SCH001" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Phone</label>
                <input className="form-control" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+91 98765 43210" />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Email</label>
              <input type="email" className="form-control" value={form.email} onChange={e => set('email', e.target.value)} placeholder="school@example.com" />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Website URL</label>
              <input type="url" className="form-control" value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://www.school.edu" />
            </div>

          </div>
        </div>

        {/* ── Working Day Configuration ── */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><strong>Working Day Configuration</strong></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Saturday working toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={saturdayWorking}
                onChange={e => setLS('saturdayWorking', e.target.checked)}
                style={{ width: 18, height: 18, accentColor: 'var(--primary)', cursor: 'pointer' }}
              />
              <div>
                <div style={{ fontWeight: 600 }}>Saturday is a working day</div>
                <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Uncheck if all Saturdays are off</div>
              </div>
            </label>

            {/* Saturday mode — shown only when saturday is working */}
            {saturdayWorking && (
              <div className="form-group" style={{ marginBottom: 0, paddingLeft: 30 }}>
                <label className="form-label">Which Saturdays are working?</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
                  {[
                    { value: 'all',   label: 'All Saturdays',         desc: 'Every Saturday is a working day' },
                    { value: '1_3_5', label: '1st, 3rd & 5th Saturday', desc: 'Odd Saturdays of each month' },
                    { value: '2_4',   label: '2nd & 4th Saturday',    desc: 'Even Saturdays of each month' },
                  ].map(opt => (
                    <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="saturdayMode"
                        value={opt.value}
                        checked={saturdayMode === opt.value}
                        onChange={() => setLS('saturdayMode', opt.value)}
                        style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }}
                      />
                      <div>
                        <span style={{ fontWeight: 500 }}>{opt.label}</span>
                        <span style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginLeft: 6 }}>— {opt.desc}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Saturday half day — shown only when saturday is working */}
            {saturdayWorking && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', paddingLeft: 30 }}>
                <input
                  type="checkbox"
                  checked={saturdayHalfDay}
                  onChange={e => setLS('saturdayHalfDay', e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: 'var(--primary)', cursor: 'pointer' }}
                />
                <div>
                  <div style={{ fontWeight: 600 }}>Working Saturdays are half days</div>
                  <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Counts as 0.5 day when deducting leave</div>
                </div>
              </label>
            )}

          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button type="submit" loading={saving}>Save Settings</Button>
        </div>

      </form>
    </div>
  );
}
