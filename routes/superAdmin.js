const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/superAdminController');
const { isAuthenticated, requireRole, requirePasswordReset } = require('../middleware/auth');

const guard = [isAuthenticated, requirePasswordReset, requireRole('super_admin')];

router.get('/dashboard', guard, ctrl.getDashboard);

router.get('/schools', guard, ctrl.getSchools);
router.get('/schools/create', guard, ctrl.getCreateSchool);
router.post('/schools/create', guard, ctrl.postCreateSchool);
router.post('/schools/:id/delete', guard, ctrl.deleteSchool);

const upload = require('../middleware/upload');

router.get('/users', guard, ctrl.getUsers);
router.get('/users/create', guard, ctrl.getCreateUser);
router.post('/users/create', guard, ctrl.postCreateUser);
router.post('/users/bulk-teachers', guard, upload.single('excelFile'), ctrl.postBulkTeachers);
router.post('/users/bulk-students', guard, upload.single('excelFile'), ctrl.postBulkStudents);
router.get('/users/template/teachers', guard, ctrl.downloadTeacherTemplate);
router.get('/users/template/students', guard, ctrl.downloadStudentTemplate);
router.get('/users/:id/edit', guard, ctrl.getEditUser);
router.post('/users/:id/edit', guard, ctrl.postEditUser);
router.post('/users/:id/toggle', guard, ctrl.toggleUserStatus);
router.post('/users/bulk-delete', guard, ctrl.postBulkDeleteUsers);
router.post('/users/:id/delete', guard, ctrl.deleteUser);
router.post('/users/:id/login-link', guard, ctrl.postGenerateLoginLink);

// ── Module Permissions ────────────────────────────────────────
router.get('/permissions', guard, ctrl.getPermissions);
router.post('/permissions/update', guard, ctrl.postUpdatePermissions);
router.post('/permissions/bulk', guard, ctrl.postBulkUpdatePermissions);

// ── Notifications ─────────────────────────────────────────────
const notifCtrl = require('../controllers/notificationController');
router.get('/notifications',      guard, notifCtrl.getNotificationList);
router.get('/notifications/create', guard, notifCtrl.getCreateNotification);
router.post('/notifications/send',  guard, notifCtrl.postSendNotification);

// ── Holiday Audit Log (all schools) ──────────────────────────
const holidayCtrl = require('../controllers/holidayController');
router.get('/holidays/audit', guard, holidayCtrl.superAdminGetAuditLog);

module.exports = router;
