const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/parentController');
const classCtrl = require('../controllers/parentClassController');
const attendanceCtrl = require('../controllers/attendanceController');
const { isAuthenticated, requireRole, requirePasswordReset } = require('../middleware/auth');
const requireModule = require('../middleware/requireModule');

const guard = [isAuthenticated, requirePasswordReset, requireRole('parent')];
const attendanceGuard = [...guard, requireModule('attendance')];

router.get('/dashboard', guard, ctrl.getDashboard);
router.get('/child-class', guard, classCtrl.getChildClass);

// ── Child Attendance Calendar ─────────────────────────────────
router.get('/child-attendance', attendanceGuard, attendanceCtrl.getParentChildAttendance);

module.exports = router;

