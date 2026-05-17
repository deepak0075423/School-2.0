import React from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getMyPayslips, downloadMyPayslip } from '../../../api/payroll.api';
import { PageHeader, Table, Badge, Button, Spinner } from '../../../components/ui/index';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function TeacherPayslips() {
  const { data, loading } = useFetch(getMyPayslips);
  const payslips = data?.data || [];

  const statusColor = { draft: 'warning', published: 'success' };

  const handleDownload = async (payslip) => {
    try {
      const blob = await downloadMyPayslip(payslip._id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payslip_${payslip.year}_${payslip.month}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    }
  };

  const columns = [
    { key: 'period',  label: 'Period',  render: r => `${MONTHS[(r.month||1)-1]} ${r.year}` },
    { key: 'gross',   label: 'Gross',   render: r => `₹${(r.grossSalary||0).toLocaleString()}` },
    { key: 'net',     label: 'Net Pay', render: r => <strong>₹{(r.netSalary||0).toLocaleString()}</strong> },
    { key: 'status',  label: 'Status',  render: r => <Badge variant={statusColor[r.status] || 'muted'}>{r.status}</Badge> },
    { key: 'actions', label: '',        render: r => r.status === 'published' && (
      <Button size="sm" variant="secondary" onClick={() => handleDownload(r)}>Download</Button>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="My Payslips" subtitle="Monthly salary slips" />
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={payslips} emptyIcon="📄" emptyTitle="No payslips yet" />}
        </div>
      </div>
    </div>
  );
}
