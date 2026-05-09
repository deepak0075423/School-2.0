import api from './axios';
// Admin
export const getAdminDashboard   = () => api.get('/fees/admin/dashboard');
export const getFeeCategories    = () => api.get('/fees/admin/fee-categories');
export const createFeeCategory   = (data) => api.post('/fees/admin/fee-categories', data);
export const updateFeeCategory   = (id, data) => api.put(`/fees/admin/fee-categories/${id}`, data);
export const getFeeHeads         = () => api.get('/fees/admin/fee-heads');
export const createFeeHead       = (data) => api.post('/fees/admin/fee-heads', data);
export const getFeeStructures    = () => api.get('/fees/admin/fee-structures');
export const createFeeStructure  = (data) => api.post('/fees/admin/fee-structures', data);
export const getFineRules        = () => api.get('/fees/admin/fine-rules');
export const createFineRule      = (data) => api.post('/fees/admin/fine-rules', data);
export const getConcessions      = () => api.get('/fees/admin/concessions');
export const createConcession    = (data) => api.post('/fees/admin/concessions', data);
export const getStudentFees      = (params) => api.get('/fees/admin/student-fees', { params });
export const getStudentFeeDetail = (id) => api.get(`/fees/admin/student-fees/${id}`);
export const getPayments         = (params) => api.get('/fees/admin/payments', { params });
export const recordPayment       = (data) => api.post('/fees/admin/payments/record', data);
export const approvePayment      = (id) => api.post(`/fees/admin/payments/${id}/approve`);
export const getSchoolLedger     = () => api.get('/fees/admin/ledger');
export const getCollectionReport = (params) => api.get('/fees/admin/reports/collection', { params });
export const getDuesReport       = (params) => api.get('/fees/admin/reports/dues', { params });
// Student
export const getMyFees    = () => api.get('/fees/student/my-fees');
export const getMyLedger  = () => api.get('/fees/student/ledger');
export const getMyPayments= () => api.get('/fees/student/payments');
export const createRazorpayOrder = (data) => api.post('/fees/student/pay/razorpay/create-order', data);
export const verifyRazorpay = (data) => api.post('/fees/student/pay/razorpay/verify', data);
// Parent
export const getChildFees = (childId) => api.get(`/fees/parent/child/${childId}/fees`);
