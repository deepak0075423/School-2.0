import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Table, Badge, Button, Modal, StatCard, Spinner } from '../ui/index';

const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const PAY_STATUS = {
  paid:     { label: 'Paid',     variant: 'success' },
  partial:  { label: 'Partial',  variant: 'warning' },
  due:      { label: 'Due',      variant: 'danger' },
  upcoming: { label: 'Upcoming', variant: 'muted' },
};
const PAYMENT_STATUS = { pending: 'warning', completed: 'success', failed: 'danger', refunded: 'muted' };

// Loads the Razorpay checkout script once
function loadRazorpay() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

/**
 * Shared fee-book UI for the student and parent screens.
 *
 * props:
 *   data           — payload from /fees/student/my-fees or /fees/parent/child/:id/fees
 *   payerName      — name shown on the gateway checkout
 *   onRefresh      — called after a successful payment
 *   api            — { payNow, createRazorpayOrder, verifyRazorpay, downloadReceipt }
 */
export default function FeeBook({ data, payerName, onRefresh, api }) {
  const [payOpen, setPayOpen]   = useState(false);
  const [paying, setPaying]     = useState(false);
  const [payForm, setPayForm]   = useState({ amount: '', paymentMode: 'upi', transactionRef: '', remarks: '' });

  if (!data) return null;
  const {
    balance, totalCharged, totalPaid, totalConcession, fineAmt,
    monthlySchedule = [], payments = [], gateway, dueTotal, suggestedAmount, currencySymbol = '₹',
  } = data;

  const openPay = () => {
    setPayForm(f => ({ ...f, amount: suggestedAmount || '' }));
    setPayOpen(true);
  };

  const submitManual = async (e) => {
    e.preventDefault();
    if (!payForm.amount || +payForm.amount <= 0) return toast.error('Enter a valid amount');
    setPaying(true);
    try {
      const res = await api.payNow(payForm);
      toast.success(res.message || 'Payment submitted for verification');
      setPayOpen(false);
      onRefresh?.();
    } catch (err) { toast.error(err.message); }
    finally { setPaying(false); }
  };

  const payOnline = async () => {
    const amount = +payForm.amount;
    if (!amount || amount <= 0) return toast.error('Enter a valid amount');
    setPaying(true);
    try {
      const ok = await loadRazorpay();
      if (!ok) throw new Error('Could not load payment gateway');
      const orderRes = await api.createRazorpayOrder({ amount });
      const { orderId, keyId, currency } = orderRes.data;

      const rzp = new window.Razorpay({
        key: keyId,
        amount: Math.round(amount * 100),
        currency: currency || 'INR',
        name: 'School Fees',
        description: 'Fee payment',
        order_id: orderId,
        prefill: { name: payerName || '' },
        handler: async (response) => {
          try {
            const v = await api.verifyRazorpay({ ...response, amount });
            toast.success(`Payment successful! Receipt: ${v.data.receiptNumber}`);
            setPayOpen(false);
            onRefresh?.();
          } catch (err) {
            toast.error(err.message || 'Payment verification failed');
          }
        },
        modal: { ondismiss: () => setPaying(false) },
      });
      rzp.on('payment.failed', (r) => toast.error(r.error?.description || 'Payment failed'));
      rzp.open();
    } catch (err) {
      toast.error(err.message);
    } finally { setPaying(false); }
  };

  const downloadReceipt = async (p) => {
    try {
      const blob = await api.downloadReceipt(p._id);
      const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${p.receiptNumber || p._id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) { toast.error(err.message || 'Download failed'); }
  };

  const monthCols = [
    { key: 'month', label: 'Month', render: m => (
      <div>
        <strong>{m.monthLabel}</strong>{m.isCurrentMonth && <Badge variant="info">current</Badge>}
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
          {m.items.map(i => i.name).join(', ')}
        </div>
      </div>
    )},
    { key: 'amount', label: 'Amount', render: m => fmt(m.chargedAmount || m.totalAmount) },
    { key: 'paid',   label: 'Paid',   render: m => fmt(m.amountPaid) },
    { key: 'due',    label: 'Due',    render: m => m.amountDue > 0 ? <strong style={{ color: 'var(--danger, #ef4444)' }}>{fmt(m.amountDue)}</strong> : '—' },
    { key: 'status', label: 'Status', render: m => {
      const s = PAY_STATUS[m.payStatus] || PAY_STATUS.upcoming;
      return <Badge variant={s.variant}>{s.label}</Badge>;
    }},
  ];

  const payCols = [
    { key: 'receipt', label: 'Receipt', render: p => p.receiptNumber || '—' },
    { key: 'amount',  label: 'Amount',  render: p => <strong>{fmt(p.amount)}</strong> },
    { key: 'mode',    label: 'Mode',    render: p => (p.paymentMode || '—').replace('_', ' ') },
    { key: 'date',    label: 'Date',    render: p => p.paymentDate ? new Date(p.paymentDate).toLocaleDateString('en-IN') : '—' },
    { key: 'status',  label: 'Status',  render: p => <Badge variant={PAYMENT_STATUS[p.paymentStatus] || 'muted'}>{p.paymentStatus}</Badge> },
    { key: 'actions', label: '',        render: p => p.paymentStatus === 'completed' && (
      <Button size="sm" variant="secondary" onClick={() => downloadReceipt(p)}>⬇ Receipt</Button>
    )},
  ];

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard icon="📋" label="Total Charged" value={fmt(totalCharged)} />
        <StatCard icon="✅" label="Total Paid"    value={fmt(totalPaid)} color="green" />
        <StatCard icon="⏳" label="Balance Due"   value={fmt(Math.max(balance, 0))} color={balance > 0 ? 'red' : 'green'} />
        {totalConcession > 0 && <StatCard icon="🎁" label="Concession" value={fmt(totalConcession)} />}
        {fineAmt > 0 && <StatCard icon="⚠️" label="Late Fine" value={fmt(fineAmt)} color="red" />}
      </div>

      {(dueTotal > 0 || balance > 0) && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <strong>Outstanding: {fmt(dueTotal > 0 ? dueTotal : balance)}</strong>
              <div style={{ fontSize: '.82rem', color: 'var(--text-muted)' }}>
                {gateway !== 'none' ? 'Pay online instantly, or submit an offline payment for admin verification.' : 'Submit an offline payment for admin verification.'}
              </div>
            </div>
            <Button onClick={openPay}>💳 Pay Now</Button>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 12 }}>Monthly Fee Schedule</h3>
        <div className="card"><div className="card-body" style={{ padding: 0 }}>
          <Table columns={monthCols} data={monthlySchedule} emptyIcon="📅" emptyTitle="No fee schedule yet" />
        </div></div>
      </div>

      <div>
        <h3 style={{ marginBottom: 12 }}>Payment History</h3>
        <div className="card"><div className="card-body" style={{ padding: 0 }}>
          <Table columns={payCols} data={payments} emptyIcon="💳" emptyTitle="No payments yet" />
        </div></div>
      </div>

      {/* Pay modal */}
      <Modal open={payOpen} onClose={() => setPayOpen(false)} title="Pay Fees">
        <div className="form-group">
          <label className="form-label required">Amount ({currencySymbol})</label>
          <input type="number" min="1" step="0.01" className="form-control" value={payForm.amount}
            onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} />
          {suggestedAmount > 0 && (
            <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
              Suggested (all dues): {fmt(suggestedAmount)}
            </div>
          )}
        </div>

        {gateway === 'razorpay' && (
          <div style={{ marginBottom: 16 }}>
            <Button style={{ width: '100%' }} loading={paying} onClick={payOnline}>
              ⚡ Pay online (UPI / Card / Netbanking)
            </Button>
            <div style={{ textAlign: 'center', margin: '12px 0', color: 'var(--text-muted)', fontSize: '.8rem' }}>
              — or submit an offline payment —
            </div>
          </div>
        )}
        {gateway === 'stripe' && (
          <div style={{ marginBottom: 12, fontSize: '.82rem', color: 'var(--text-muted)' }}>
            Online card payment is handled at the school office for now — submit your payment reference below.
          </div>
        )}

        <form onSubmit={submitManual}>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Payment Mode</label>
              <select className="form-control" value={payForm.paymentMode}
                onChange={e => setPayForm(f => ({ ...f, paymentMode: e.target.value }))}>
                <option value="upi">UPI</option>
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cheque">Cheque</option>
                <option value="dd">Demand Draft</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Reference / UTR No.</label>
              <input className="form-control" value={payForm.transactionRef}
                onChange={e => setPayForm(f => ({ ...f, transactionRef: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Remarks</label>
            <input className="form-control" value={payForm.remarks}
              onChange={e => setPayForm(f => ({ ...f, remarks: e.target.value }))} />
          </div>
          <Button type="submit" variant="secondary" loading={paying} style={{ width: '100%' }}>
            Submit for admin verification
          </Button>
        </form>
      </Modal>
    </>
  );
}
