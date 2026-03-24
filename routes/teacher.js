const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/teacherController');
const sectionCtrl = require('../controllers/sectionController');
const attendanceCtrl = require('../controllers/attendanceController');
const { isAuthenticated, requireRole, requirePasswordReset } = require('../middleware/auth');
const requireModule = require('../middleware/requireModule');

const guard = [isAuthenticated, requirePasswordReset, requireRole('teacher')];
const attendanceGuard = [...guard, requireModule('attendance')];

router.get('/dashboard', guard, ctrl.getDashboard);

// ── My Section ────────────────────────────────────────────────
router.get('/my-section', guard, sectionCtrl.getMySection);
router.post('/announcements/create', guard, sectionCtrl.postCreateAnnouncement);
router.post('/announcements/:id/delete', guard, sectionCtrl.postDeleteAnnouncement);
router.post('/monitors/assign', guard, sectionCtrl.postAssignMonitor);
router.post('/monitors/remove', guard, sectionCtrl.postRemoveMonitor);

// ── Student Attendance (Class Teacher / Substitute) ───────────
router.get('/attendance', attendanceGuard, sectionCtrl.getAttendance);
router.post('/attendance/mark', attendanceGuard, sectionCtrl.postMarkAttendance);

// ── Teacher Self Attendance ───────────────────────────────────
router.get('/my-attendance', attendanceGuard, attendanceCtrl.getTeacherSelfAttendance);
router.post('/my-attendance/mark', attendanceGuard, attendanceCtrl.postMarkTeacherSelfAttendance);

// ── Regularization Requests ───────────────────────────────────
router.get('/regularization', attendanceGuard, attendanceCtrl.getRegularizationForm);
router.post('/regularization/submit', attendanceGuard, attendanceCtrl.postSubmitRegularization);

// ── Attendance Dashboard (Class Analytics) ────────────────────
router.get('/attendance-dashboard', attendanceGuard, attendanceCtrl.getAttendanceDashboard);

// ── Student Profile (with attendance history) ─────────────────
router.get('/students/:studentId/profile', attendanceGuard, attendanceCtrl.getStudentProfile);

// ── Student Correction Requests ───────────────────────────────
router.get('/correction-requests', attendanceGuard, attendanceCtrl.getCorrectionRequests);
router.post('/correction-requests/review', attendanceGuard, attendanceCtrl.postReviewCorrection);

// ── Timetable ─────────────────────────────────────────────────
router.get('/timetable', guard, sectionCtrl.getTeacherTimetable);

module.exports = router;

