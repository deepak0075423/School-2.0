import api from './axios';
export const getDashboard   = () => api.get('/payroll/admin/dashboard');
export const getStructures  = () => api.get('/payroll/admin/structures');
export const createStructure = (data) => api.post('/payroll/admin/structures', data);
export const getAssignments = () => api.get('/payroll/admin/assignments');
export const assignEmployee = (data) => api.post('/payroll/admin/assignments', data);
export const getPayrollRuns = () => api.get('/payroll/admin/runs');
export const createRun      = (data) => api.post('/payroll/admin/runs', data);
export const getRunDetail   = (id) => api.get(`/payroll/admin/runs/${id}`);
export const publishRun     = (id) => api.post(`/payroll/admin/runs/${id}/publish`);
export const getReports     = () => api.get('/payroll/admin/reports');
export const getAuditLog    = () => api.get('/payroll/admin/audit');
// Teacher
export const getMyCtc       = () => api.get('/payroll/teacher/ctc');
export const getMyPayslips  = () => api.get('/payroll/teacher/payslips');
export const getPayslipDetail    = (id) => api.get(`/payroll/teacher/payslips/${id}`);
export const downloadMyPayslip   = (id) => api.get(`/payroll/teacher/payslips/${id}/download`, { responseType: 'blob' });
