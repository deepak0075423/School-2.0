const express    = require('express');
const router     = express.Router();
const payrollCtrl = require('../controllers/payrollController');
const payslipCtrl = require('../controllers/payslipController');
const { isAuthenticated, requireRole, requirePasswordReset } = require('../middleware/auth');
const requireModule = require('../middleware/requireModule');

const adminGuard   = [isAuthenticated, requirePasswordReset, requireRole('school_admin'), requireModule('payroll')];
const teacherGuard = [isAuthenticated, requirePasswordReset, requireRole('teacher'),      requireModule('payroll')];

// ── Admin routes ─────────────────────────────────────────────────────────────

router.get('/admin/dashboard',                     adminGuard, payrollCtrl.getDashboard);

// Salary structures
router.get('/admin/structures',                    adminGuard, payrollCtrl.getStructures);
router.get('/admin/structures/create',             adminGuard, payrollCtrl.getCreateStructure);
router.post('/admin/structures/create',            adminGuard, payrollCtrl.postCreateStructure);
router.get('/admin/structures/:id/edit',           adminGuard, payrollCtrl.getEditStructure);
router.post('/admin/structures/:id/edit',          adminGuard, payrollCtrl.postEditStructure);
router.post('/admin/structures/:id/toggle',        adminGuard, payrollCtrl.postToggleStructure);

// Salary assignments
router.get('/admin/assignments',                   adminGuard, payrollCtrl.getAssignments);
router.get('/admin/assignments/assign',            adminGuard, payrollCtrl.getAssignEmployee);
router.post('/admin/assignments/assign',           adminGuard, payrollCtrl.postAssignEmployee);
router.get('/admin/assignments/:id/edit',          adminGuard, payrollCtrl.getEditAssignment);
router.post('/admin/assignments/:id/edit',         adminGuard, payrollCtrl.postEditAssignment);
router.post('/admin/assignments/:id/deactivate',   adminGuard, payrollCtrl.postDeactivateAssignment);
router.get('/admin/assignments/:id/update-ctc',    adminGuard, payrollCtrl.getUpdateCtc);
router.post('/admin/assignments/:id/update-ctc',   adminGuard, payrollCtrl.postUpdateCtc);
router.get('/admin/assignments/:id/ctc-history',   adminGuard, payrollCtrl.getCtcHistory);

// Payroll runs
router.get('/admin/runs',                          adminGuard, payrollCtrl.getPayrollRuns);
router.get('/admin/runs/create',                   adminGuard, payrollCtrl.getCreateRun);
router.post('/admin/runs/create',                  adminGuard, payrollCtrl.postCreateRun);
router.get('/admin/runs/:id',                      adminGuard, payrollCtrl.getRunDetail);
router.post('/admin/runs/:id/status',              adminGuard, payrollCtrl.postUpdateRunStatus);
router.post('/admin/runs/:id/publish',             adminGuard, payrollCtrl.postPublishRun);
router.post('/admin/runs/:id/entries/:entryId',    adminGuard, payrollCtrl.postUpdateEntry);

// Payslip download (admin)
router.get('/admin/payslips/:id/download',         adminGuard, payslipCtrl.adminDownloadPayslip);

// Reports & audit
router.get('/admin/reports',                       adminGuard, payrollCtrl.getReports);
router.get('/admin/audit',                         adminGuard, payrollCtrl.getAuditLog);

// API
router.get('/api/structures/:id/components',       adminGuard, payrollCtrl.apiGetStructureComponents);

// ── Teacher routes ───────────────────────────────────────────────────────────

router.get('/teacher/ctc',                         teacherGuard, payrollCtrl.getMyCtc);
router.get('/teacher/payslips',                    teacherGuard, payslipCtrl.getMyPayslips);
router.get('/teacher/payslips/:id',                teacherGuard, payslipCtrl.getPayslipDetail);
router.get('/teacher/payslips/:id/download',       teacherGuard, payslipCtrl.downloadPayslip);

module.exports = router;
