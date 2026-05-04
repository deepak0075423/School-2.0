const express   = require('express');
const router    = express.Router();
const adminCtrl  = require('../controllers/feesController');
const studentCtrl = require('../controllers/feesStudentController');
const { isAuthenticated, requireRole, requirePasswordReset } = require('../middleware/auth');
const requireModule = require('../middleware/requireModule');

const adminGuard   = [isAuthenticated, requirePasswordReset, requireRole('school_admin'), requireModule('fees')];
const studentGuard = [isAuthenticated, requirePasswordReset, requireRole('student'),       requireModule('fees')];
const parentGuard  = [isAuthenticated, requirePasswordReset, requireRole('parent'),        requireModule('fees')];

// ── Admin: Dashboard ─────────────────────────────────────────────────────────
router.get('/admin/dashboard',       adminGuard, adminCtrl.getDashboard);

// ── Admin: Fee Categories ────────────────────────────────────────────────────
router.get('/admin/fee-categories',               adminGuard, adminCtrl.getFeeCategories);
router.get('/admin/fee-categories/create',        adminGuard, adminCtrl.getCreateFeeCategory);
router.post('/admin/fee-categories/create',       adminGuard, adminCtrl.postCreateFeeCategory);
router.get('/admin/fee-categories/:id/edit',      adminGuard, adminCtrl.getEditFeeCategory);
router.post('/admin/fee-categories/:id/edit',     adminGuard, adminCtrl.postEditFeeCategory);
router.post('/admin/fee-categories/:id/toggle',   adminGuard, adminCtrl.postToggleFeeCategory);

// ── Admin: Fee Heads ─────────────────────────────────────────────────────────
router.get('/admin/fee-heads',                    adminGuard, adminCtrl.getFeeHeads);
router.get('/admin/fee-heads/create',             adminGuard, adminCtrl.getCreateFeeHead);
router.post('/admin/fee-heads/create',            adminGuard, adminCtrl.postCreateFeeHead);
router.get('/admin/fee-heads/:id/edit',           adminGuard, adminCtrl.getEditFeeHead);
router.post('/admin/fee-heads/:id/edit',          adminGuard, adminCtrl.postEditFeeHead);
router.post('/admin/fee-heads/:id/toggle',        adminGuard, adminCtrl.postToggleFeeHead);

// ── Admin: Fee Structures ────────────────────────────────────────────────────
router.get('/admin/fee-structures',               adminGuard, adminCtrl.getFeeStructures);
router.get('/admin/fee-structures/create',        adminGuard, adminCtrl.getCreateFeeStructure);
router.post('/admin/fee-structures/create',       adminGuard, adminCtrl.postCreateFeeStructure);
router.get('/admin/fee-structures/:id',           adminGuard, adminCtrl.getFeeStructureDetail);
router.get('/admin/fee-structures/:id/edit',      adminGuard, adminCtrl.getEditFeeStructure);
router.post('/admin/fee-structures/:id/edit',     adminGuard, adminCtrl.postEditFeeStructure);
router.post('/admin/fee-structures/:id/toggle',   adminGuard, adminCtrl.postToggleFeeStructure);
router.post('/admin/fee-structures/:id/generate-demand', adminGuard, adminCtrl.postGenerateFeeDemand);
router.post('/admin/fee-structures/:id/add-fee-head',   adminGuard, adminCtrl.postAddFeeHeadToStructure);

// ── Admin: Fine Rules ────────────────────────────────────────────────────────
router.get('/admin/fine-rules',                   adminGuard, adminCtrl.getFineRules);
router.get('/admin/fine-rules/create',            adminGuard, adminCtrl.getCreateFineRule);
router.post('/admin/fine-rules/create',           adminGuard, adminCtrl.postCreateFineRule);
router.get('/admin/fine-rules/:id/edit',          adminGuard, adminCtrl.getEditFineRule);
router.post('/admin/fine-rules/:id/edit',         adminGuard, adminCtrl.postEditFineRule);
router.post('/admin/fine-rules/:id/toggle',       adminGuard, adminCtrl.postToggleFineRule);

// ── Admin: Concession Templates ──────────────────────────────────────────────
router.get('/admin/concessions',                  adminGuard, adminCtrl.getConcessions);
router.get('/admin/concessions/create',           adminGuard, adminCtrl.getCreateConcession);
router.post('/admin/concessions/create',          adminGuard, adminCtrl.postCreateConcession);
router.get('/admin/concessions/:id/edit',         adminGuard, adminCtrl.getEditConcession);
router.post('/admin/concessions/:id/edit',        adminGuard, adminCtrl.postEditConcession);
router.post('/admin/concessions/:id/toggle',      adminGuard, adminCtrl.postToggleConcession);

// ── Admin: Student Fee Management ───────────────────────────────────────────
router.get('/admin/student-fees',                 adminGuard, adminCtrl.getStudentFees);
router.get('/admin/student-fees/:studentId',      adminGuard, adminCtrl.getStudentFeeDetail);
router.get('/admin/student-fees/:studentId/ledger', adminGuard, adminCtrl.getStudentLedger);
router.post('/admin/student-fees/:studentId/assign-concession', adminGuard, adminCtrl.postAssignStudentConcession);
router.post('/admin/student-fees/:studentId/concessions/:concessionId/remove', adminGuard, adminCtrl.postRemoveStudentConcession);

// ── Admin: Payments ──────────────────────────────────────────────────────────
router.get('/admin/payments',                     adminGuard, adminCtrl.getPayments);
router.get('/admin/payments/record',              adminGuard, adminCtrl.getRecordPayment);
router.post('/admin/payments/record',             adminGuard, adminCtrl.postRecordPayment);
router.post('/admin/payments/:id/approve',        adminGuard, adminCtrl.postApprovePayment);
router.post('/admin/payments/:id/reject',         adminGuard, adminCtrl.postRejectPayment);
router.get('/admin/payments/:id/receipt',         adminGuard, adminCtrl.getPaymentReceipt);
router.get('/admin/payments/:id/download',        adminGuard, adminCtrl.getDownloadReceipt);

// ── Admin: Ledger ────────────────────────────────────────────────────────────
router.get('/admin/ledger',                       adminGuard, adminCtrl.getSchoolLedger);

// ── Admin: Reports ───────────────────────────────────────────────────────────
router.get('/admin/reports/collection',           adminGuard, adminCtrl.getCollectionReport);
router.get('/admin/reports/dues',                 adminGuard, adminCtrl.getDuesReport);
router.get('/admin/reports/concession',           adminGuard, adminCtrl.getConcessionReport);

// ── Admin: Settings ──────────────────────────────────────────────────────────
router.get('/admin/settings',                     adminGuard, adminCtrl.getSettings);
router.post('/admin/settings',                    adminGuard, adminCtrl.postSettings);

// ── Admin + Teacher: JSON API ─────────────────────────────────────────────────
const apiGuard = [isAuthenticated, requirePasswordReset, requireRole('school_admin', 'teacher'), requireModule('fees')];
router.get('/api/students/:studentId/balance',   apiGuard, adminCtrl.apiGetStudentBalance);
router.get('/api/classes/:classId/sections',     apiGuard, adminCtrl.apiGetSections);

// ── Student: My Fees ─────────────────────────────────────────────────────────
router.get('/student/my-fees',                   studentGuard, studentCtrl.getMyFees);
router.get('/student/ledger',                    studentGuard, studentCtrl.getMyLedger);
router.get('/student/payments',                  studentGuard, studentCtrl.getMyPayments);
router.get('/student/pay',                       studentGuard, studentCtrl.getPayNow);
router.post('/student/pay',                      studentGuard, studentCtrl.postPayNow);
router.post('/student/pay/razorpay/create-order', studentGuard, studentCtrl.postCreateRazorpayOrder);
router.post('/student/pay/razorpay/verify',       studentGuard, studentCtrl.postVerifyRazorpay);
router.post('/student/pay/stripe/create-intent',  studentGuard, studentCtrl.postCreateStripeIntent);
router.post('/student/pay/stripe/verify',         studentGuard, studentCtrl.postVerifyStripe);
router.get('/student/payments/:id/receipt',      studentGuard, studentCtrl.getMyReceipt);
router.get('/student/payments/:id/download',     studentGuard, studentCtrl.downloadMyReceipt);

// ── Parent: Child Fees ───────────────────────────────────────────────────────
router.get('/parent/fees', parentGuard, studentCtrl.getParentFeesRedirect);
router.get('/parent/child/:childId/fees',                           parentGuard, studentCtrl.getParentChildFees);
router.get('/parent/child/:childId/pay',                            parentGuard, studentCtrl.getParentPayNow);
router.post('/parent/child/:childId/pay',                           parentGuard, studentCtrl.postParentPayNow);
router.post('/parent/child/:childId/pay/razorpay/create-order',     parentGuard, studentCtrl.postParentCreateRazorpayOrder);
router.post('/parent/child/:childId/pay/razorpay/verify',           parentGuard, studentCtrl.postParentVerifyRazorpay);
router.post('/parent/child/:childId/pay/stripe/create-intent',      parentGuard, studentCtrl.postParentCreateStripeIntent);
router.post('/parent/child/:childId/pay/stripe/verify',             parentGuard, studentCtrl.postParentVerifyStripe);
router.get('/parent/child/:childId/payments/:paymentId/receipt',    parentGuard, studentCtrl.getParentPaymentReceipt);
router.get('/parent/child/:childId/payments/:paymentId/download',   parentGuard, studentCtrl.downloadParentReceipt);

module.exports = router;
