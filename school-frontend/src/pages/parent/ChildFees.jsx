import React, { useState, useEffect, useCallback } from 'react';
import * as feesApi from '../../api/fees.api';
import { useAuth } from '../../contexts/AuthContext';
import { PageHeader, Spinner } from '../../components/ui/index';
import FeeBook from '../../components/fees/FeeBook';

export default function ParentChildFees() {
  const { user } = useAuth();

  const [children, setChildren] = useState([]);
  const [childId, setChildId]   = useState('');
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await feesApi.getMyChildren();
        const kids = res?.data || [];
        setChildren(kids);
        if (kids.length) setChildId(String(kids[0]._id));
        else { setLoading(false); setError('No child linked to your account. Contact the school admin.'); }
      } catch (err) {
        setLoading(false);
        setError(err.message || 'Failed to load children');
      }
    })();
  }, []);

  const loadFees = useCallback(async () => {
    if (!childId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await feesApi.getChildFees(childId);
      setData(res?.data || null);
    } catch (err) {
      setError(err.message || 'Failed to load fees');
    } finally { setLoading(false); }
  }, [childId]);

  useEffect(() => { loadFees(); }, [loadFees]);

  return (
    <div className="page">
      <PageHeader title={data?.child?.name ? `Fee Book — ${data.child.name}` : "Child's Fees"}
        subtitle={data?.activeYear?.yearName ? `Academic year ${data.activeYear.yearName}` : 'Fee dues, schedule and payments'}
        action={children.length > 1 && (
          <select className="form-control" style={{ width: 200 }} value={childId}
            onChange={e => setChildId(e.target.value)}>
            {children.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        )} />

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
      ) : error ? (
        <div className="card"><div className="card-body" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>👨‍👩‍👧</div>
          <p style={{ color: 'var(--text-muted)' }}>{error}</p>
        </div></div>
      ) : (
        <FeeBook
          data={data}
          payerName={user?.name}
          onRefresh={loadFees}
          api={{
            payNow:              (body) => feesApi.parentPayNow(childId, body),
            createRazorpayOrder: (body) => feesApi.parentCreateRazorpayOrder(childId, body),
            verifyRazorpay:      (body) => feesApi.parentVerifyRazorpay(childId, body),
            downloadReceipt:     (paymentId) => feesApi.downloadChildReceipt(childId, paymentId),
          }}
        />
      )}
    </div>
  );
}
