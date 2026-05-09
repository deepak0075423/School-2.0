import React, { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { updateStudent, toggleStudent, checkEmail, getClassesWithSections } from '../../api/admin.api';
import { PageHeader, Table, Badge, Button, Modal, Confirm, Pagination, Spinner } from '../../components/ui/index';

const EMPTY = {
  name: '', email: '', phone: '',
  rollNumber: '', admissionNumber: '', dob: '', gender: '', bloodGroup: '', category: '', address: '',
  classId: '', currentSection: '',
  parentId: '', parentName: '', parentQuery: '',
  newParent: { name: '', email: '', phone: '' },
  parentMode: 'search',
};

const EMPTY_EDIT = {
  name: '', phone: '', password: '',
  rollNumber: '', admissionNumber: '', dob: '', gender: '', bloodGroup: '', category: '', address: '',
  classId: '', currentSection: '',
  parentId: '', parentName: '', parentQuery: '',
  newParent: { name: '', email: '', phone: '' },
  parentMode: 'search',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+\d\s\-]{7,15}$/;

const Err = ({ msg }) => msg
  ? <span style={{ fontSize: '.74rem', color: 'var(--danger)', marginTop: 3, display: 'block' }}>{msg}</span>
  : null;

const Row = ({ children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>{children}</div>
);

const Steps = ({ step, labels = ['Basic Info', 'Profile Details', 'Parent / Guardian'] }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 22 }}>
    {labels.map((label, i) => {
      const n = i + 1;
      const done = step > n, active = step === n;
      return (
        <React.Fragment key={n}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%', fontSize: '.78rem', fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: done ? 'var(--success)' : active ? 'var(--primary)' : 'var(--border)',
              color: (done || active) ? '#fff' : 'var(--text-muted)',
              transition: 'background .2s', flexShrink: 0,
            }}>{done ? '✓' : n}</div>
            <span style={{ fontSize: '.78rem', fontWeight: active ? 600 : 400, color: active ? 'var(--text)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {label}
            </span>
          </div>
          {i < labels.length - 1 && (
            <div style={{ flex: 1, height: 2, background: step > n ? 'var(--success)' : 'var(--border)', borderRadius: 2, transition: 'background .2s', minWidth: 12 }} />
          )}
        </React.Fragment>
      );
    })}
  </div>
);

// ── Reusable parent panel (used in both add + edit step 3) ────────────────────
const ParentPanel = ({ form, setForm, errs, setErrs, lookupTimer, setLooking, looking }) => {
  const handleQuery = (val) => {
    setForm(f => ({ ...f, parentQuery: val, parentId: '', parentName: '' }));
    clearTimeout(lookupTimer.current);
    if (!val.trim()) return;
    lookupTimer.current = setTimeout(async () => {
      setLooking(true);
      try {
        const res = await api.parentLookup(val.trim());
        if (res?.data) {
          setForm(f => ({ ...f, parentId: res.data._id, parentName: res.data.name }));
          setErrs(e => ({ ...e, parentQuery: undefined }));
        }
      } catch {}
      finally { setLooking(false); }
    }, 500);
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 0, marginBottom: 18, borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)' }}>
        {[['search', '🔍  Link Existing Parent'], ['create', '➕  Create New Parent']].map(([mode, label]) => (
          <button key={mode} type="button"
            onClick={() => { setForm(f => ({ ...f, parentMode: mode, parentQuery: '', parentId: '', parentName: '' })); setErrs({}); }}
            style={{
              flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer', fontSize: '.82rem', fontWeight: 600,
              background: form.parentMode === mode ? 'var(--primary)' : 'var(--bg)',
              color:      form.parentMode === mode ? '#fff' : 'var(--text-muted)',
              transition: 'all .15s',
            }}>
            {label}
          </button>
        ))}
      </div>

      {form.parentMode === 'search' && (
        <>
          <div className="form-group">
            <label className="form-label required">Search by name, email or phone</label>
            <div style={{ position: 'relative' }}>
              <input className={`form-control${errs.parentQuery ? ' error' : ''}`}
                value={form.parentQuery} onChange={e => handleQuery(e.target.value)}
                placeholder="Type to search…" autoFocus />
              {looking && (
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
                  <Spinner size="sm" />
                </span>
              )}
            </div>
            <Err msg={errs.parentQuery} />
          </div>
          {form.parentId ? (
            <div style={{ padding: '12px 16px', background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 600, color: '#065f46', fontSize: '.9rem' }}>✅ Parent linked</div>
                <div style={{ color: '#047857', fontSize: '.82rem', marginTop: 2 }}>{form.parentName}</div>
              </div>
              <button type="button" onClick={() => setForm(f => ({ ...f, parentId: '', parentName: '', parentQuery: '' }))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#065f46', fontSize: '.9rem' }}>✕</button>
            </div>
          ) : (
            <div style={{ padding: '12px 16px', background: 'var(--bg)', border: '1px dashed var(--border)', borderRadius: 'var(--radius)', fontSize: '.82rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              Search above to find and link an existing parent account
              <br />
              <button type="button" onClick={() => setForm(f => ({ ...f, parentMode: 'create' }))}
                style={{ marginTop: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontWeight: 600, fontSize: '.82rem' }}>
                Parent not found? Create a new one →
              </button>
            </div>
          )}
        </>
      )}

      {form.parentMode === 'create' && (
        <>
          <Row>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label required">Parent Full Name</label>
              <input className={`form-control${errs.parentName ? ' error' : ''}`} placeholder="Parent's name" autoFocus
                value={form.newParent.name} onChange={e => setForm(f => ({ ...f, newParent: { ...f.newParent, name: e.target.value } }))} />
              <Err msg={errs.parentName} />
            </div>
            <div className="form-group">
              <label className="form-label required">Parent Email</label>
              <input type="email" className={`form-control${errs.parentEmail ? ' error' : ''}`} placeholder="parent@email.com"
                value={form.newParent.email} onChange={e => setForm(f => ({ ...f, newParent: { ...f.newParent, email: e.target.value } }))} />
              <Err msg={errs.parentEmail} />
            </div>
            <div className="form-group">
              <label className="form-label">Parent Phone</label>
              <input type="tel" className={`form-control${errs.parentPhone ? ' error' : ''}`} placeholder="+91 98765 43210"
                value={form.newParent.phone} onChange={e => setForm(f => ({ ...f, newParent: { ...f.newParent, phone: e.target.value } }))} />
              <Err msg={errs.parentPhone} />
            </div>
          </Row>
          <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            A one-time password will be emailed to the parent. They must set a new password on first login.
          </p>
        </>
      )}
    </>
  );
};

export default function Students() {
  const [page, setPage]     = useState(1);
  const [search, setSearch] = useState('');
  const [del, setDel]       = useState(null);
  const [delLoad, setDL]    = useState(false);

  // ── Add wizard ────────────────────────────────────────────────────────────
  const [modal, setModal]       = useState(false);
  const [step, setStep]         = useState(1);
  const [form, setForm]         = useState(EMPTY);
  const [errs, setErrs]         = useState({});
  const [saving, setSaving]     = useState(false);
  const [checking, setChecking] = useState(false);
  const [parentLooking, setPL]  = useState(false);
  const lookupTimer = useRef(null);

  // ── Edit wizard ───────────────────────────────────────────────────────────
  const [editUser, setEditUser]       = useState(null);
  const [editStep, setEditStep]       = useState(1);
  const [editForm, setEditForm]       = useState(EMPTY_EDIT);
  const [editErrs, setEditErrs]       = useState({});
  const [editSaving, setEditSave]     = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editParentPL, setEditPL]     = useState(false);
  const editLookupTimer = useRef(null);

  // ── Bulk import ───────────────────────────────────────────────────────────
  const [bulkModal, setBulkModal]   = useState(false);
  const [bulkFile, setBulkFile]     = useState(null);
  const [bulkLoading, setBulkLoad]  = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null);
  // { total, current, currentName, created, errorCount, errors, done }
  const bulkFileRef = useRef(null);

  // ── Shared class/section data ─────────────────────────────────────────────
  const [classesData, setClassesData]   = useState([]);
  const [classesLoading, setClassesLoad] = useState(false);

  const { data, loading, refetch } = useFetch(
    () => api.getStudents({ page, search, limit: 20 }),
    [page, search],
  );

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const loadClasses = async () => {
    if (classesData.length || classesLoading) return;
    setClassesLoad(true);
    try {
      const res = await getClassesWithSections();
      setClassesData(res?.data || []);
    } catch {}
    finally { setClassesLoad(false); }
  };

  // ── Add: validations ──────────────────────────────────────────────────────
  const validateStep1 = () => {
    const e = {};
    if (!form.name.trim())  e.name  = 'Full name is required';
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!EMAIL_RE.test(form.email)) e.email = 'Invalid email address';
    if (form.phone && !PHONE_RE.test(form.phone)) e.phone = 'Invalid phone number';
    return e;
  };

  const validateParent = (f, errsObj) => {
    if (f.parentMode === 'search' && !f.parentId) {
      errsObj.parentQuery = 'Please link a parent or switch to create a new one';
    }
    if (f.parentMode === 'create') {
      if (!f.newParent.name.trim())  errsObj.parentName  = 'Parent name is required';
      if (!f.newParent.email.trim()) errsObj.parentEmail = 'Parent email is required';
      else if (!EMAIL_RE.test(f.newParent.email)) errsObj.parentEmail = 'Invalid email';
      if (f.newParent.phone && !PHONE_RE.test(f.newParent.phone)) errsObj.parentPhone = 'Invalid phone';
    }
  };

  const openCreate = () => { loadClasses(); setForm(EMPTY); setErrs({}); setStep(1); setModal(true); };

  const handleNext = async () => {
    if (step === 1) {
      const e = validateStep1();
      setErrs(e);
      if (Object.keys(e).length) { toast.error(Object.values(e)[0]); return; }
      setChecking(true);
      try {
        const res = await checkEmail(form.email.trim());
        if (res?.exists) {
          setErrs(p => ({ ...p, email: 'This email is already registered' }));
          toast.error('This email is already registered');
          return;
        }
      } catch {}
      finally { setChecking(false); }
    }
    setErrs({});
    setStep(s => s + 1);
  };

  const handleBack = () => { setErrs({}); setStep(s => s - 1); };

  const handleCreate = async () => {
    const e = {};
    validateParent(form, e);
    setErrs(e);
    if (Object.keys(e).length) { toast.error(Object.values(e)[0]); return; }
    setSaving(true);
    try {
      await api.createStudent({
        name:  form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        profile: {
          rollNumber: form.rollNumber, admissionNumber: form.admissionNumber,
          dob: form.dob, gender: form.gender, bloodGroup: form.bloodGroup,
          category: form.category, address: form.address,
          currentSection: form.currentSection || undefined,
        },
        parentId:  form.parentMode === 'search' ? form.parentId  : undefined,
        newParent: form.parentMode === 'create' ? form.newParent : undefined,
      });
      toast.success('Student created successfully');
      setModal(false);
      setForm(EMPTY);
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleBulkImport = async (e) => {
    e.preventDefault();
    if (!bulkFile) { toast.error('Please select an Excel file'); return; }
    setBulkLoad(true);
    setBulkProgress({ total: 0, current: 0, currentName: '', created: 0, errorCount: 0, errors: [], done: false });
    try {
      const fd = new FormData();
      fd.append('excelFile', bulkFile);
      const token = localStorage.getItem('token');
      const baseURL = import.meta.env.VITE_API_URL || '/api';
      const response = await fetch(`${baseURL}/admin/students/bulk`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!response.ok) {
        const json = await response.json();
        throw new Error(json.message || 'Import failed');
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let didCreate = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split('\n\n');
        buf = chunks.pop();
        for (const chunk of chunks) {
          if (!chunk.startsWith('data: ')) continue;
          const evt = JSON.parse(chunk.slice(6));
          if (evt.type === 'total') {
            setBulkProgress(p => ({ ...p, total: evt.total }));
          } else if (evt.type === 'processing') {
            setBulkProgress(p => ({ ...p, current: evt.current, currentName: evt.name }));
          } else if (evt.type === 'row_done') {
            if (evt.success) didCreate = true;
            setBulkProgress(p => ({
              ...p,
              created:    evt.success ? p.created + 1    : p.created,
              errorCount: evt.success ? p.errorCount     : p.errorCount + 1,
              errors:     evt.success ? p.errors : [...p.errors, { row: evt.row, name: evt.name, reason: evt.reason }],
            }));
          } else if (evt.type === 'done') {
            setBulkProgress(p => ({ ...p, done: true }));
            if (didCreate) refetch();
          } else if (evt.type === 'error') {
            throw new Error(evt.message);
          }
        }
      }
    } catch (err) { toast.error(err.message); setBulkLoad(false); setBulkProgress(null); return; }
    setBulkLoad(false);
  };

  const handleDownloadTemplate = async () => {
    try {
      const buffer = await api.downloadStudentTemplate();
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a'); a.href = url; a.download = 'student-template.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Failed to download template'); }
  };

  const handleDelete = async () => {
    setDL(true);
    try { await api.deleteStudent(del._id); toast.success('Student deleted'); setDel(null); refetch(); }
    catch (err) { toast.error(err.message); }
    finally { setDL(false); }
  };

  // ── Edit: open + fetch detail ─────────────────────────────────────────────
  const handleEdit = async (r) => {
    setEditUser(r);
    setEditStep(1);
    setEditErrs({});
    setEditForm({ ...EMPTY_EDIT, name: r.name || '', phone: r.phone || '' });
    loadClasses();
    setEditLoading(true);
    try {
      const res = await api.getStudent(r._id);
      const profile = res?.data?.profile ?? res?.profile;
      setEditForm(f => ({
        ...f,
        rollNumber:      profile?.rollNumber      || '',
        admissionNumber: profile?.admissionNumber || '',
        dob:             profile?.dob ? profile.dob.slice(0, 10) : '',
        gender:          profile?.gender          || '',
        bloodGroup:      profile?.bloodGroup      || '',
        category:        profile?.category        || '',
        address:         profile?.address         || '',
        classId:         profile?.currentSection?.class?._id || '',
        currentSection:  profile?.currentSection?._id        || '',
        parentId:        profile?.parent?._id  || '',
        parentName:      profile?.parent?.name || '',
        parentQuery:     profile?.parent?.name || '',
      }));
    } catch {}
    finally { setEditLoading(false); }
  };

  const handleEditNext = () => {
    if (editStep === 1) {
      const e = {};
      if (!editForm.name.trim()) e.name = 'Full name is required';
      if (editForm.phone && !PHONE_RE.test(editForm.phone)) e.phone = 'Invalid phone number';
      if (editForm.password && editForm.password.length < 6) e.password = 'Min 6 characters';
      setEditErrs(e);
      if (Object.keys(e).length) { toast.error(Object.values(e)[0]); return; }
    }
    setEditErrs({});
    setEditStep(s => s + 1);
  };

  const handleEditBack = () => { setEditErrs({}); setEditStep(s => s - 1); };

  const handleUpdate = async () => {
    const e = {};
    validateParent(editForm, e);
    setEditErrs(e);
    if (Object.keys(e).length) { toast.error(Object.values(e)[0]); return; }
    setEditSave(true);
    try {
      await updateStudent(editUser._id, {
        name:            editForm.name,
        phone:           editForm.phone,
        password:        editForm.password || undefined,
        rollNumber:      editForm.rollNumber,
        admissionNumber: editForm.admissionNumber,
        dob:             editForm.dob,
        gender:          editForm.gender,
        bloodGroup:      editForm.bloodGroup,
        category:        editForm.category,
        address:         editForm.address,
        currentSection:  editForm.currentSection || null,
        parentId:        editForm.parentMode === 'search' ? (editForm.parentId || null) : undefined,
        newParent:       editForm.parentMode === 'create' ? editForm.newParent : undefined,
      });
      toast.success('Student updated');
      setEditUser(null);
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setEditSave(false); }
  };

  const handleToggle = async (r) => {
    toast.loading(r.isActive ? 'Deactivating…' : 'Activating…', { id: 'tog' });
    try {
      await toggleStudent(r._id);
      toast.success(r.isActive ? 'Student deactivated' : 'Student activated', { id: 'tog' });
      refetch();
    } catch (err) { toast.error(err.message, { id: 'tog' }); }
  };

  const columns = [
    { key: 'name', label: 'Student', render: r => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="avatar avatar-sm" style={{ background: 'var(--success)' }}>{r.name?.[0]}</div>
        <div>
          <div style={{ fontWeight: 600 }}>{r.name}</div>
          <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>{r.email}</div>
        </div>
      </div>
    )},
    { key: 'rollNumber', label: 'Roll No', render: r => r.rollNumber || '—' },
    { key: 'class', label: 'Class / Section', render: r =>
      r.className ? `${r.className}${r.sectionName ? ` – ${r.sectionName}` : ''}` : '—' },
    { key: 'gender',     label: 'Gender',  render: r => r.gender || '—' },
    { key: 'status',     label: 'Status',  render: r =>
      <Badge variant={r.isActive ? 'success' : 'muted'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
    { key: 'actions', label: 'Actions', render: r => (
      <div className="actions" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(r)}>Edit</button>
        <button className="btn btn-warning btn-sm"   onClick={() => handleToggle(r)}>{r.isActive ? 'Deactivate' : 'Activate'}</button>
        <button className="btn btn-danger btn-sm"    onClick={() => setDel(r)}>Delete</button>
      </div>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="Students" subtitle={`${data?.total ?? 0} students`}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" type="button" onClick={() => { setBulkModal(true); setBulkResult(null); setBulkFile(null); }}>Bulk Import</Button>
            <Button type="button" onClick={openCreate}>+ Add Student</Button>
          </div>
        } />

      <div className="card">
        <div className="card-header">
          <input className="form-control" style={{ maxWidth: 280 }} placeholder="🔍 Search students…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {loading
            ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={data?.data} emptyIcon="👨‍🎓" emptyTitle="No students found" />}
        </div>
        {data && <div className="card-footer"><Pagination page={page} pages={data.pages} total={data.total} onPage={setPage} /></div>}
      </div>

      {/* ══ Add Student Wizard ════════════════════════════════════════════════ */}
      <Modal open={modal} onClose={() => setModal(false)} title="Add Student" maxWidth={560}
        footer={
          step === 1 ? (
            <>
              <Button type="button" variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
              <Button type="button" onClick={handleNext} loading={checking}>Next →</Button>
            </>
          ) : step === 2 ? (
            <>
              <Button type="button" variant="secondary" onClick={handleBack}>← Back</Button>
              <Button type="button" onClick={handleNext}>Next →</Button>
            </>
          ) : (
            <>
              <Button type="button" variant="secondary" onClick={handleBack}>← Back</Button>
              <Button type="button" onClick={handleCreate} loading={saving}>Create Student</Button>
            </>
          )
        }>

        <Steps step={step} />

        {step === 1 && (
          <div>
            <div className="form-group">
              <label className="form-label required">Full Name</label>
              <input className={`form-control${errs.name ? ' error' : ''}`} placeholder="Aarav Sharma"
                value={form.name} onChange={set('name')} autoFocus />
              <Err msg={errs.name} />
            </div>
            <Row>
              <div className="form-group">
                <label className="form-label required">Email Address</label>
                <input type="email" className={`form-control${errs.email ? ' error' : ''}`} placeholder="student@school.com"
                  value={form.email} onChange={set('email')} />
                <Err msg={errs.email} />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input type="tel" className={`form-control${errs.phone ? ' error' : ''}`} placeholder="+91 98765 43210"
                  value={form.phone} onChange={set('phone')} />
                <Err msg={errs.phone} />
              </div>
            </Row>
            <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
              A one-time password will be emailed to the student. They must set a new password on first login.
            </p>
          </div>
        )}

        {step === 2 && (
          <div>
            <Row>
              <div className="form-group">
                <label className="form-label">Roll Number</label>
                <input className="form-control" placeholder="A-01" value={form.rollNumber} onChange={set('rollNumber')} autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Admission Number</label>
                <input className="form-control" placeholder="ADM-2024-001" value={form.admissionNumber} onChange={set('admissionNumber')} />
              </div>
              <div className="form-group">
                <label className="form-label">Date of Birth</label>
                <input type="date" className="form-control" max={new Date().toISOString().slice(0,10)}
                  value={form.dob} onChange={set('dob')} />
              </div>
              <div className="form-group">
                <label className="form-label">Gender</label>
                <select className="form-control" value={form.gender} onChange={set('gender')}>
                  <option value="">Select</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Blood Group</label>
                <select className="form-control" value={form.bloodGroup} onChange={set('bloodGroup')}>
                  <option value="">Select</option>
                  {['A+','A−','B+','B−','AB+','AB−','O+','O−'].map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Category</label>
                <select className="form-control" value={form.category} onChange={set('category')}>
                  <option value="">Select</option>
                  <option value="General">General</option>
                  <option value="OBC">OBC</option>
                  <option value="SC">SC</option>
                  <option value="ST">ST</option>
                  <option value="EWS">EWS</option>
                </select>
              </div>
            </Row>
            <Row>
              <div className="form-group">
                <label className="form-label">Class</label>
                <select className="form-control" value={form.classId}
                  onChange={e => setForm(f => ({ ...f, classId: e.target.value, currentSection: '' }))}>
                  <option value="">Select Class</option>
                  {classesData.map(c => <option key={c._id} value={c._id}>{c.className}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Section</label>
                <select className="form-control" value={form.currentSection} onChange={set('currentSection')} disabled={!form.classId}>
                  <option value="">Select Section</option>
                  {(classesData.find(c => c._id === form.classId)?.sections || []).map(s =>
                    <option key={s._id} value={s._id}>{s.sectionName}</option>
                  )}
                </select>
              </div>
            </Row>
            <div className="form-group">
              <label className="form-label">Address</label>
              <input className="form-control" placeholder="Street, City, State" value={form.address} onChange={set('address')} />
            </div>
          </div>
        )}

        {step === 3 && (
          <ParentPanel
            form={form} setForm={setForm}
            errs={errs} setErrs={setErrs}
            lookupTimer={lookupTimer}
            setLooking={setPL} looking={parentLooking}
          />
        )}
      </Modal>

      {/* ══ Edit Student Wizard (3 steps) ═════════════════════════════════════ */}
      <Modal open={!!editUser} onClose={() => setEditUser(null)} title="Edit Student" maxWidth={560}
        footer={
          editStep === 1 ? (
            <>
              <Button type="button" variant="secondary" onClick={() => setEditUser(null)}>Cancel</Button>
              <Button type="button" onClick={handleEditNext}>Next →</Button>
            </>
          ) : editStep === 2 ? (
            <>
              <Button type="button" variant="secondary" onClick={handleEditBack}>← Back</Button>
              <Button type="button" onClick={handleEditNext}>Next →</Button>
            </>
          ) : (
            <>
              <Button type="button" variant="secondary" onClick={handleEditBack}>← Back</Button>
              <Button type="button" onClick={handleUpdate} loading={editSaving}>Save Changes</Button>
            </>
          )
        }>

        <Steps step={editStep} />

        {editLoading ? (
          <div style={{ padding: '32px 0', display: 'flex', justifyContent: 'center' }}><Spinner /></div>
        ) : (
          <>
            {/* Step 1: Basic Info */}
            {editStep === 1 && (
              <div>
                <div className="form-group">
                  <label className="form-label required">Full Name</label>
                  <input className={`form-control${editErrs.name ? ' error' : ''}`} autoFocus
                    value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                  <Err msg={editErrs.name} />
                </div>
                <Row>
                  <div className="form-group">
                    <label className="form-label">Phone</label>
                    <input type="tel" className={`form-control${editErrs.phone ? ' error' : ''}`}
                      placeholder="+91 98765 43210" value={editForm.phone}
                      onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
                    <Err msg={editErrs.phone} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">New Password</label>
                    <input type="password" className={`form-control${editErrs.password ? ' error' : ''}`}
                      minLength={6} placeholder="Leave blank to keep current"
                      value={editForm.password} onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))} />
                    <Err msg={editErrs.password} />
                  </div>
                </Row>
              </div>
            )}

            {/* Step 2: Profile Details */}
            {editStep === 2 && (
              <div>
                <Row>
                  <div className="form-group">
                    <label className="form-label">Roll Number</label>
                    <input className="form-control" autoFocus value={editForm.rollNumber}
                      onChange={e => setEditForm(p => ({ ...p, rollNumber: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Admission No</label>
                    <input className="form-control" value={editForm.admissionNumber}
                      onChange={e => setEditForm(p => ({ ...p, admissionNumber: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Date of Birth</label>
                    <input type="date" className="form-control" value={editForm.dob}
                      onChange={e => setEditForm(p => ({ ...p, dob: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Gender</label>
                    <select className="form-control" value={editForm.gender}
                      onChange={e => setEditForm(f => ({ ...f, gender: e.target.value }))}>
                      <option value="">Select</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Blood Group</label>
                    <select className="form-control" value={editForm.bloodGroup}
                      onChange={e => setEditForm(f => ({ ...f, bloodGroup: e.target.value }))}>
                      <option value="">Select</option>
                      {['A+','A−','B+','B−','AB+','AB−','O+','O−'].map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <select className="form-control" value={editForm.category}
                      onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}>
                      <option value="">Select</option>
                      <option value="General">General</option>
                      <option value="OBC">OBC</option>
                      <option value="SC">SC</option>
                      <option value="ST">ST</option>
                      <option value="EWS">EWS</option>
                    </select>
                  </div>
                </Row>
                <Row>
                  <div className="form-group">
                    <label className="form-label">Class</label>
                    <select className="form-control" value={editForm.classId}
                      onChange={e => setEditForm(f => ({ ...f, classId: e.target.value, currentSection: '' }))}>
                      <option value="">Select Class</option>
                      {classesData.map(c => <option key={c._id} value={c._id}>{c.className}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Section</label>
                    <select className="form-control" value={editForm.currentSection}
                      onChange={e => setEditForm(f => ({ ...f, currentSection: e.target.value }))}
                      disabled={!editForm.classId}>
                      <option value="">Select Section</option>
                      {(classesData.find(c => c._id === editForm.classId)?.sections || []).map(s =>
                        <option key={s._id} value={s._id}>{s.sectionName}</option>
                      )}
                    </select>
                  </div>
                </Row>
                <div className="form-group">
                  <label className="form-label">Address</label>
                  <input className="form-control" placeholder="Street, City, State" value={editForm.address}
                    onChange={e => setEditForm(p => ({ ...p, address: e.target.value }))} />
                </div>
              </div>
            )}

            {/* Step 3: Parent / Guardian */}
            {editStep === 3 && (
              <ParentPanel
                form={editForm} setForm={setEditForm}
                errs={editErrs} setErrs={setEditErrs}
                lookupTimer={editLookupTimer}
                setLooking={setEditPL} looking={editParentPL}
              />
            )}
          </>
        )}
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={handleDelete}
        loading={delLoad} title="Delete Student" message={`Delete "${del?.name}"? This cannot be undone.`} />

      {/* ══ Fullscreen blocking overlay while import runs ═══════════════════ */}
      {bulkLoading && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'all',
        }}>
          <div style={{ background: 'var(--card)', borderRadius: 12, padding: '32px 36px', width: '100%', maxWidth: 480, boxShadow: '0 8px 40px rgba(0,0,0,.3)' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '1.05rem' }}>Importing Students…</h3>

            {/* Progress bar */}
            {bulkProgress && bulkProgress.total > 0 && (
              <>
                <div style={{ background: 'var(--border)', borderRadius: 99, height: 8, marginBottom: 10, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 99, background: 'var(--primary)',
                    width: `${Math.round((bulkProgress.current / bulkProgress.total) * 100)}%`,
                    transition: 'width .2s',
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                  <span>Processing {bulkProgress.current} of {bulkProgress.total}</span>
                  <span>{Math.round((bulkProgress.current / bulkProgress.total) * 100)}%</span>
                </div>
              </>
            )}

            {/* Currently processing */}
            {bulkProgress?.currentName && (
              <div style={{ fontSize: '.82rem', color: 'var(--text-muted)', marginBottom: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Creating account for <strong style={{ color: 'var(--text)' }}>{bulkProgress.currentName}</strong>…
              </div>
            )}

            {/* Live counters */}
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1, background: 'var(--success-light,#f0fdf4)', border: '1px solid var(--success)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--success)' }}>{bulkProgress?.created ?? 0}</div>
                <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>Created</div>
              </div>
              <div style={{ flex: 1, background: (bulkProgress?.errorCount ?? 0) > 0 ? 'var(--danger-light,#fef2f2)' : 'var(--bg)', border: `1px solid ${(bulkProgress?.errorCount ?? 0) > 0 ? 'var(--danger)' : 'var(--border)'}`, borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: (bulkProgress?.errorCount ?? 0) > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{bulkProgress?.errorCount ?? 0}</div>
                <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>Errors</div>
              </div>
              <div style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{bulkProgress?.total ?? 0}</div>
                <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>Total</div>
              </div>
            </div>

            <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 18, marginBottom: 0, textAlign: 'center' }}>
              Please wait — do not close or refresh this page.
            </p>
          </div>
        </div>
      )}

      {/* ══ Bulk Import Modal ════════════════════════════════════════════════ */}
      <Modal open={bulkModal && !bulkLoading} onClose={() => { setBulkModal(false); setBulkProgress(null); setBulkFile(null); }} title="Bulk Import Students" maxWidth={520}
        footer={
          bulkProgress?.done ? (
            <Button onClick={() => { setBulkModal(false); setBulkProgress(null); setBulkFile(null); }}>Close</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => { setBulkModal(false); setBulkProgress(null); setBulkFile(null); }}>Cancel</Button>
              <Button form="bulk-import-form" type="submit" loading={bulkLoading}>Import</Button>
            </>
          )
        }>
        {bulkProgress?.done ? (
          /* ── Results ── */
          <div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1, background: 'var(--success-light,#f0fdf4)', border: '1px solid var(--success)', borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--success)' }}>{bulkProgress.created}</div>
                <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Students Created</div>
              </div>
              <div style={{ flex: 1, background: bulkProgress.errorCount > 0 ? 'var(--danger-light,#fef2f2)' : 'var(--bg)', border: `1px solid ${bulkProgress.errorCount > 0 ? 'var(--danger)' : 'var(--border)'}`, borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 700, color: bulkProgress.errorCount > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{bulkProgress.errorCount}</div>
                <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Errors</div>
              </div>
            </div>
            {bulkProgress.errors.length > 0 && (
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                {bulkProgress.errors.map((e, i) => (
                  <div key={i} style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: '.82rem' }}>
                    <span style={{ fontWeight: 600 }}>Row {e.row}{e.name ? ` — ${e.name}` : ''}: </span>
                    <span style={{ color: 'var(--danger)' }}>{e.reason}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ── File picker ── */
          <form id="bulk-import-form" onSubmit={handleBulkImport}>
            <p style={{ fontSize: '.85rem', color: 'var(--text-muted)', marginTop: 0 }}>
              Upload an Excel file (.xlsx). Parent accounts are created automatically, or mapped to an existing account if the email already exists.
            </p>
            <div style={{ marginBottom: 14 }}>
              <Button type="button" variant="secondary" onClick={handleDownloadTemplate} style={{ width: '100%' }}>
                Download Template (.xlsx)
              </Button>
            </div>
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 14px', marginBottom: 14, fontSize: '.78rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 4 }}>Required columns:</strong>
              Full Name · Email Address · Phone Number · Admission Number · Date of Birth (dd/mm/yyyy) · Gender · Blood Group · Category · Class · Section · Address · Parent Full Name · Parent Email · Parent Phone Number
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label required">Excel File</label>
              <input ref={bulkFileRef} type="file" className="form-control" accept=".xlsx,.xls"
                onChange={e => setBulkFile(e.target.files[0] || null)} />
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
