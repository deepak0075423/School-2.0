import React from 'react';
import useFetch from '../../../hooks/useFetch';
import * as feesApi from '../../../api/fees.api';
import { useAuth } from '../../../contexts/AuthContext';
import { PageHeader, Spinner } from '../../../components/ui/index';
import FeeBook from '../../../components/fees/FeeBook';

export default function StudentMyFees() {
  const { user } = useAuth();
  const { data, loading, refetch } = useFetch(feesApi.getMyFees);

  if (loading) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page">
      <PageHeader title="My Fee Book"
        subtitle={data?.activeYear?.yearName ? `Academic year ${data.activeYear.yearName}` : 'Fee dues, schedule and payments'} />
      <FeeBook
        data={data}
        payerName={user?.name}
        onRefresh={refetch}
        api={{
          payNow:              feesApi.payNow,
          createRazorpayOrder: feesApi.createRazorpayOrder,
          verifyRazorpay:      feesApi.verifyRazorpay,
          downloadReceipt:     feesApi.downloadMyReceipt,
        }}
      />
    </div>
  );
}
