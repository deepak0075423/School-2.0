const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/studentController');
const classCtrl = require('../controllers/studentClassController');
const attendanceCtrl = require('../controllers/attendanceController');
const timetableCtrl = require('../controllers/timetableController');
const { isAuthenticated, requireRole, requirePasswordReset } = require('../middleware/auth');
const requireModule = require('../middleware/requireModule');

const guard = [isAuthenticated, requirePasswordReset, requireRole('student')];
const attendanceGuard = [...guard, requireModule('attendance')];

router.get('/dashboard', guard, ctrl.getDashboard);
router.get('/my-class', guard, classCtrl.getMyClass);

// ── Timetable ─────────────────────────────────────────────────
router.get('/timetable', guard, timetableCtrl.studentViewTimetable);
router.get('/timetable/download', guard, timetableCtrl.studentDownloadTimetable);

// ── Attendance Calendar ───────────────────────────────────────
router.get('/my-attendance', attendanceGuard, attendanceCtrl.getStudentAttendanceCalendar);

// ── Correction Requests ───────────────────────────────────────
router.get('/correction', attendanceGuard, attendanceCtrl.getStudentCorrectionForm);
router.post('/correction/submit', attendanceGuard, attendanceCtrl.postSubmitStudentCorrection);

module.exports = router;

