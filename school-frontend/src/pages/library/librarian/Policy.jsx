import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getPolicy, updatePolicy } from '../../../api/library.api';
import { PageHeader, Button, Card, Spinner } from '../../../components/ui/index';

export default function LibraryPolicy() {
  const { data: policy, loading, refetch } = useFetch(getPolicy);
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [form,    setForm]    = useState({});

  const startEdit = () => {
    setForm({
      maxBooksPerMember: policy?.maxBooksPerMember || 3,
      loanPeriodDays:    policy?.loanPeriodDays    || 14,
      renewalLimit:      policy?.renewalLimit      || 2,
      finePerDay:        policy?.finePerDay        || 2,
      gracePeriod:       policy?.gracePeriod       || 0,
    });
    setEditing(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updatePolicy(form);
      toast.success('Policy updated');
      setEditing(false);
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="page">
      <PageHeader title="Library Policy" subtitle="Loan and fine configuration"
        action={!editing && <Button onClick={startEdit}>Edit Policy</Button>} />
      {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
        : (
          <Card>
            {editing ? (
              <form onSubmit={handleSave}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16 }}>
                  {[
                    ['maxBooksPerMember','Max Books Per Member'],
                    ['loanPeriodDays','Loan Period (days)'],
                    ['renewalLimit','Renewal Limit'],
                    ['finePerDay','Fine Per Day (₹)'],
                    ['gracePeriod','Grace Period (days)'],
                  ].map(([k,label]) => (
                    <div className="form-group" key={k}>
                      <label className="form-label">{label}</label>
                      <input type="number" className="form-control" min={0} value={form[k] || ''}
                        onChange={e => setForm(f => ({ ...f, [k]: +e.target.value }))} />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <Button type="submit" loading={saving}>Save</Button>
                  <Button variant="secondary" type="button" onClick={() => setEditing(false)}>Cancel</Button>
                </div>
              </form>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  ['Max Books Per Member', policy?.maxBooksPerMember],
                  ['Loan Period',          `${policy?.loanPeriodDays} days`],
                  ['Renewal Limit',        policy?.renewalLimit],
                  ['Fine Per Day',         `₹${policy?.finePerDay || 0}`],
                  ['Grace Period',         `${policy?.gracePeriod || 0} days`],
                ].map(([k,v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                    <span className="text-muted text-sm">{k}</span>
                    <strong>{v ?? '—'}</strong>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
    </div>
  );
}
