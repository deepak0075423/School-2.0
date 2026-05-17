import { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { PageHeader, Table, Button, Modal, Confirm, Spinner, Badge } from '../../components/ui/index';

const TYPE_OPTIONS = [
  { value: 'public',          label: 'Public Holiday' },
  { value: 'school_specific', label: 'School Specific' },
  { value: 'optional',        label: 'Optional Holiday' },
  { value: 'exam_break',      label: 'Exam Break' },
];

const TYPE_VARIANT = {
  public:          'success',
  school_specific: 'info',
  optional:        'warning',
  exam_break:      'danger',
};

const TYPE_LABEL = {
  public:          'Public',
  school_specific: 'School',
  optional:        'Optional',
  exam_break:      'Exam Break',
};

const DEPT_OPTIONS = [
  { value: 'teaching_staff', label: 'Teaching Staff' },
  { value: 'admin_staff',    label: 'Admin Staff' },
];

const EMPTY_FORM = {
  name: '', startDate: '', endDate: '', type: 'public', description: '',
  applicability: { scope: 'all', classes: [], departments: [] },
};

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateRange(h) {
  const s = h.startDate;
  const e = h.endDate;
  if (!s) return '—';
  const sStr = fmtDate(s);
  if (!e) return sStr;
  const sIso = new Date(s).toISOString().slice(0, 10);
  const eIso = new Date(e).toISOString().slice(0, 10);
  return sIso === eIso ? sStr : `${sStr} – ${fmtDate(e)}`;
}

function durationDays(h) {
  if (!h.startDate || !h.endDate) return 1;
  const diff = new Date(h.endDate) - new Date(h.startDate);
  return Math.round(diff / 86400000) + 1;
}

function isUpcoming(h) {
  return new Date(h.endDate || h.startDate) >= new Date();
}

const myColumns = [
  { key: 'name',  label: 'Holiday',  render: r => <strong>{r.name}</strong> },
  { key: 'dates', label: 'Date(s)',  render: r => (
      <div>
        <div style={{ fontSize: '.85rem' }}>{fmtDateRange(r)}</div>
        {durationDays(r) > 1 && <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{durationDays(r)} days</div>}
      </div>
    )
  },
  { key: 'type', label: 'Type', render: r => <Badge variant={TYPE_VARIANT[r.type] || 'info'}>{TYPE_LABEL[r.type] || r.type}</Badge> },
  { key: 'desc', label: 'Note', render: r => <span className="text-muted text-sm">{r.description || '—'}</span> },
];

export default function Holidays() {
  const [tab, setTab] = useState('mine');

  const { data: myHolidays,  loading: myLoading  } = useFetch(api.getMyHolidays);
  const { data: allHolidays, loading: allLoading, refetch } = useFetch(api.getHolidays);
  const { data: classesData } = useFetch(api.getClasses);
  const classes = classesData || [];

  const [modal,       setModal]       = useState(false);
  const [editItem,    setEditItem]    = useState(null);
  const [del,         setDel]         = useState(null);
  const [saving,      setSaving]      = useState(false);
  const [delLoad,     setDL]          = useState(false);
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [importing,   setImporting]   = useState(false);
  const [importModal, setImportModal] = useState(false);
  const fileRef = useRef();

  const openCreate = () => { setForm(EMPTY_FORM); setEditItem(null); setModal('create'); };

  const openEdit = (h) => {
    setForm({
      name:        h.name,
      startDate:   h.startDate ? new Date(h.startDate).toISOString().slice(0, 10) : '',
      endDate:     h.endDate   ? new Date(h.endDate).toISOString().slice(0, 10)   : '',
      type:        h.type,
      description: h.description || '',
      applicability: {
        scope:       h.applicability?.scope       || 'all',
        classes:     (h.applicability?.classes    || []).map(c => c._id?.toString() || c.toString()),
        departments: h.applicability?.departments || [],
      },
    });
    setEditItem(h);
    setModal('edit');
  };

  const setApply = (patch) =>
    setForm(f => ({ ...f, applicability: { ...f.applicability, ...patch } }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim())    return toast.error('Holiday name is required');
    if (!form.startDate)      return toast.error('Start date is required');
    if (!form.endDate)        return toast.error('End date is required');
    if (form.endDate < form.startDate) return toast.error('End date must be on or after start date');
    if (form.applicability.scope === 'specific_classes' && !form.applicability.classes.length)
      return toast.error('Select at least one class');
    if (form.applicability.scope === 'specific_departments' && !form.applicability.departments.length)
      return toast.error('Select at least one department');

    setSaving(true);
    try {
      if (modal === 'edit') {
        await api.updateHoliday(editItem._id, form);
        toast.success('Holiday updated');
      } else {
        await api.createHoliday(form);
        toast.success('Holiday added — notifications sent');
      }
      setModal(false);
      refetch();
    } catch (err) { toast.error(err.response?.data?.message || err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDL(true);
    try { await api.deleteHoliday(del._id); toast.success('Deleted'); setDel(null); refetch(); }
    catch (err) { toast.error(err.response?.data?.message || err.message); }
    finally { setDL(false); }
  };

  const handleExport = async () => {
    try {
      const res = await api.exportHolidays();
      const url = URL.createObjectURL(new Blob([res]));
      const a = document.createElement('a'); a.href = url; a.download = 'holidays.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { toast.error(err.message); }
  };

  const handleTemplate = async () => {
    try {
      const res = await api.downloadHolidayTemplate();
      const url = URL.createObjectURL(new Blob([res]));
      const a = document.createElement('a'); a.href = url; a.download = 'holiday_template.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { toast.error(err.message); }
  };

  const handleImportFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('csvFile', file);
      const res = await api.importHolidays(fd);
      toast.success(`Imported ${res.imported ?? 0} holidays`);
      if (res.errors?.length) toast.error(`${res.errors.length} rows had errors`);
      setImportModal(false);
      refetch();
    } catch (err) { toast.error(err.response?.data?.message || err.message); }
    finally { setImporting(false); }
  };

  const myData  = myHolidays  || [];
  const allData = allHolidays || [];
  const myUpcoming  = myData.filter(isUpcoming).length;
  const allUpcoming = allData.filter(isUpcoming).length;

  const manageColumns = [
    { key: 'name',          label: 'Holiday',       render: r => <strong>{r.name}</strong> },
    { key: 'dates',         label: 'Date(s)',        render: r => (
        <div>
          <div style={{ fontSize: '.85rem' }}>{fmtDateRange(r)}</div>
          {durationDays(r) > 1 && <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{durationDays(r)} days</div>}
        </div>
      )
    },
    { key: 'type',          label: 'Type',           render: r => <Badge variant={TYPE_VARIANT[r.type] || 'info'}>{TYPE_LABEL[r.type] || r.type}</Badge> },
    { key: 'applicability', label: 'Applicability',  render: r => {
        const scope = r.applicability?.scope || 'all';
        if (scope === 'all') return <Badge variant="info">All</Badge>;
        if (scope === 'specific_classes') {
          const cnt = r.applicability?.classes?.length || 0;
          return <Badge variant="warning">{cnt} Class{cnt !== 1 ? 'es' : ''}</Badge>;
        }
        if (scope === 'specific_departments') {
          const labels = (r.applicability?.departments || [])
            .map(d => d === 'teaching_staff' ? 'Teachers' : 'Admins');
          return <Badge variant="warning">{labels.join(', ') || '—'}</Badge>;
        }
        return null;
      }
    },
    { key: 'description',   label: 'Description',   render: r => <span className="text-muted text-sm">{r.description || '—'}</span> },
    { key: 'actions',       label: '',              render: r => (
        <div className="actions">
          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Edit</button>
          <button className="btn btn-danger btn-sm"    onClick={() => setDel(r)}>Delete</button>
        </div>
      )
    },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Holidays"
        subtitle={tab === 'mine'
          ? `${myData.length} holidays · ${myUpcoming} upcoming`
          : `${allData.length} total · ${allUpcoming} upcoming`
        }
        action={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {tab === 'manage' && <Button variant="secondary" onClick={() => setImportModal(true)}>⬆ Import</Button>}
            <Button variant="secondary" onClick={handleExport}>⬇ Export</Button>
            {tab === 'manage' && <Button onClick={openCreate}>+ Add Holiday</Button>}
          </div>
        }
      />

      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
        onChange={handleImportFile} />

      <div className="tabs" style={{ marginBottom: '1rem' }}>
        <button className={`tab${tab === 'mine' ? ' active' : ''}`} onClick={() => setTab('mine')}>
          My Holidays
        </button>
        <button className={`tab${tab === 'manage' ? ' active' : ''}`} onClick={() => setTab('manage')}>
          Manage All Holidays
        </button>
      </div>

      {tab === 'mine' && (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {myLoading
              ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
              : <Table columns={myColumns} data={myData} emptyIcon="🎉" emptyTitle="No holidays for you" />
            }
          </div>
        </div>
      )}

      {tab === 'manage' && (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {allLoading
              ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
              : <Table columns={manageColumns} data={allData} emptyIcon="🎉" emptyTitle="No holidays configured"
                  emptySubtitle="Add holidays manually or import from an Excel file." />
            }
          </div>
        </div>
      )}

      {/* Import modal */}
      <Modal open={importModal} onClose={() => setImportModal(false)} title="Import Holidays"
        footer={<Button variant="secondary" onClick={() => setImportModal(false)}>Close</Button>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p className="text-muted" style={{ margin: 0, fontSize: '.9rem' }}>
            Download the template, fill in your holidays, then upload the completed file.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <span style={{ fontSize: '1.4rem' }}>📄</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '.88rem' }}>Holiday Import Template</div>
              <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>Excel file with required columns</div>
            </div>
            <Button variant="secondary" onClick={handleTemplate}>⬇ Download</Button>
          </div>
          <div
            onClick={() => !importing && fileRef.current?.click()}
            style={{
              border: '2px dashed var(--border)', borderRadius: 8, padding: '28px 20px',
              textAlign: 'center', cursor: importing ? 'default' : 'pointer',
              background: 'var(--surface)', transition: 'border-color .15s',
            }}
            onMouseEnter={e => { if (!importing) e.currentTarget.style.borderColor = 'var(--primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
          >
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>⬆️</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              {importing ? 'Importing…' : 'Click to upload file'}
            </div>
            <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Supports .xlsx, .xls, .csv</div>
            {importing && <div style={{ marginTop: 10 }}><Spinner size="sm" /></div>}
          </div>
        </div>
      </Modal>

      {/* Create / Edit modal */}
      <Modal open={!!modal} onClose={() => setModal(false)}
        title={modal === 'edit' ? 'Edit Holiday' : 'Add Holiday'}
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="holiday-form" type="submit" loading={saving}>
            {modal === 'edit' ? 'Save Changes' : 'Add'}
          </Button>
        </>}>
        <form id="holiday-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label required">Holiday Name</label>
            <input className="form-control" required autoFocus
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Diwali" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label required">Start Date</label>
              <input type="date" className="form-control" required
                value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value, endDate: f.endDate < e.target.value ? e.target.value : f.endDate }))} />
            </div>
            <div className="form-group">
              <label className="form-label required">End Date</label>
              <input type="date" className="form-control" required
                value={form.endDate} min={form.startDate}
                onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label required">Type</label>
            <select className="form-control" value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Applicability</label>
            <select className="form-control" value={form.applicability.scope}
              onChange={e => setApply({ scope: e.target.value, classes: [], departments: [] })}>
              <option value="all">All (Teachers, Students &amp; Parents)</option>
              <option value="specific_classes">Specific Classes</option>
              <option value="specific_departments">Specific Departments</option>
            </select>
          </div>
          {form.applicability.scope === 'specific_classes' && (
            <div className="form-group">
              <label className="form-label">Select Classes</label>
              {classes.length === 0 ? (
                <p className="text-muted text-sm">No classes available.</p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 6, maxHeight: 160, overflowY: 'auto' }}>
                  {classes.map(cls => (
                    <label key={cls._id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '.88rem' }}>
                      <input type="checkbox"
                        checked={form.applicability.classes.includes(cls._id)}
                        onChange={e => {
                          const ids = form.applicability.classes;
                          setApply({ classes: e.target.checked ? [...ids, cls._id] : ids.filter(id => id !== cls._id) });
                        }}
                      />
                      {cls.className}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          {form.applicability.scope === 'specific_departments' && (
            <div className="form-group">
              <label className="form-label">Select Departments</label>
              <div style={{ display: 'flex', gap: 24, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 6 }}>
                {DEPT_OPTIONS.map(d => (
                  <label key={d.value} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '.88rem' }}>
                    <input type="checkbox"
                      checked={form.applicability.departments.includes(d.value)}
                      onChange={e => {
                        const depts = form.applicability.departments;
                        setApply({ departments: e.target.checked ? [...depts, d.value] : depts.filter(v => v !== d.value) });
                      }}
                    />
                    {d.label}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-control" rows={2}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Optional notes about this holiday" />
          </div>
        </form>
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={handleDelete}
        loading={delLoad} title="Delete Holiday"
        message={`Delete "${del?.name}"? This cannot be undone.`} />
    </div>
  );
}
