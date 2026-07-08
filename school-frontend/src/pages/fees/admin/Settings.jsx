import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getFeeSettings, updateFeeSettings } from '../../../api/fees.api';
import { PageHeader, Spinner, Button, Alert } from '../../../components/ui/index';

const EMPTY = {
  onlinePaymentEnabled: false, paymentGateway: 'none',
  razorpayKeyId: '', razorpayKeySecret: '',
  stripePublishableKey: '', stripeSecretKey: '',
  currency: 'INR', currencySymbol: '₹', receiptPrefix: 'REC',
};

export default function FeesSettings() {
  const { data, loading, refetch } = useFetch(getFeeSettings);
  const [form, setForm]     = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setForm({
      onlinePaymentEnabled: !!data.onlinePaymentEnabled,
      paymentGateway:       data.paymentGateway || 'none',
      razorpayKeyId:        data.razorpayKeyId || '',
      razorpayKeySecret:    data.razorpayKeySecret || '',
      stripePublishableKey: data.stripePublishableKey || '',
      stripeSecretKey:      data.stripeSecretKey || '',
      currency:             data.currency || 'INR',
      currencySymbol:       data.currencySymbol || '₹',
      receiptPrefix:        data.receiptPrefix || 'REC',
    });
  }, [data]);

  const f = (key) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(p => ({ ...p, [key]: v }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (form.onlinePaymentEnabled && form.paymentGateway === 'none')
      return toast.error('Select a payment gateway to enable online payments');
    if (form.onlinePaymentEnabled && form.paymentGateway === 'razorpay' && (!form.razorpayKeyId || !form.razorpayKeySecret))
      return toast.error('Enter your Razorpay Key ID and Key Secret');
    if (form.onlinePaymentEnabled && form.paymentGateway === 'stripe' && (!form.stripePublishableKey || !form.stripeSecretKey))
      return toast.error('Enter your Stripe publishable and secret keys');

    setSaving(true);
    try {
      await updateFeeSettings(form);
      toast.success('Payment settings saved');
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page">
      <PageHeader title="Fees Settings" subtitle="Your school's own payment gateway — student and parent fee payments go directly to it" />

      <form onSubmit={handleSave} style={{ maxWidth: 640 }}>
        {/* Gateway */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h3 className="card-title">💳 Online Payment Gateway</h3></div>
          <div className="card-body">
            <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', marginBottom: 16 }}>
              <input type="checkbox" checked={form.onlinePaymentEnabled} onChange={f('onlinePaymentEnabled')} />
              <span>
                <strong>Enable online payments</strong>
                <span style={{ display: 'block', fontSize: '.78rem', color: 'var(--text-muted)' }}>
                  Students and parents will see a "Pay online" option in their fee book
                </span>
              </span>
            </label>

            <div className="form-group">
              <label className="form-label">Gateway</label>
              <select className="form-control" value={form.paymentGateway} onChange={f('paymentGateway')}>
                <option value="none">— None —</option>
                <option value="razorpay">Razorpay</option>
                <option value="stripe">Stripe</option>
              </select>
            </div>

            {form.paymentGateway === 'razorpay' && (
              <>
                <Alert variant="info">
                  Payments are collected in <strong>your school's own Razorpay account</strong>. Find your keys in the
                  Razorpay dashboard under Settings → API Keys.
                </Alert>
                <div className="form-row form-row-2" style={{ marginTop: 12 }}>
                  <div className="form-group">
                    <label className="form-label required">Key ID</label>
                    <input className="form-control" placeholder="rzp_live_…" value={form.razorpayKeyId} onChange={f('razorpayKeyId')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label required">Key Secret</label>
                    <input type="password" className="form-control" placeholder={form.razorpayKeySecret === '***' ? 'Saved — enter to replace' : 'Key secret'}
                      value={form.razorpayKeySecret} onChange={f('razorpayKeySecret')} />
                  </div>
                </div>
              </>
            )}

            {form.paymentGateway === 'stripe' && (
              <>
                <Alert variant="info">
                  Payments are collected in <strong>your school's own Stripe account</strong>. Find your keys in the
                  Stripe dashboard under Developers → API keys.
                </Alert>
                <div className="form-row form-row-2" style={{ marginTop: 12 }}>
                  <div className="form-group">
                    <label className="form-label required">Publishable Key</label>
                    <input className="form-control" placeholder="pk_live_…" value={form.stripePublishableKey} onChange={f('stripePublishableKey')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label required">Secret Key</label>
                    <input type="password" className="form-control" placeholder={form.stripeSecretKey === '***' ? 'Saved — enter to replace' : 'sk_live_…'}
                      value={form.stripeSecretKey} onChange={f('stripeSecretKey')} />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Currency & receipts */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h3 className="card-title">🧾 Currency & Receipts</h3></div>
          <div className="card-body">
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Currency</label>
                <select className="form-control" value={form.currency}
                  onChange={e => setForm(p => ({
                    ...p, currency: e.target.value,
                    currencySymbol: { INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'د.إ' }[e.target.value] || p.currencySymbol,
                  }))}>
                  {['INR', 'USD', 'EUR', 'GBP', 'AED'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Receipt Number Prefix</label>
                <input className="form-control" maxLength={8} value={form.receiptPrefix} onChange={f('receiptPrefix')} />
              </div>
            </div>
            <p style={{ fontSize: '.78rem', color: 'var(--text-muted)', margin: 0 }}>
              Receipts are numbered {form.receiptPrefix || 'REC'}-000001, {form.receiptPrefix || 'REC'}-000002, …
            </p>
          </div>
        </div>

        <Button type="submit" loading={saving}>💾 Save Settings</Button>
      </form>
    </div>
  );
}
