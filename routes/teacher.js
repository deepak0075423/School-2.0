const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/teacherController');
const sectionCtrl = require('../controllers/sectionController');
const { isAuthenticated, requireRole, requirePasswordReset } = require('../middleware/auth');

const guard = [isAuthenticated, requirePasswordReset, requireRole('teacher')];

router.get('/dashboard', guard, ctrl.getDashboard);

// ── My Section ────────────────────────────────────────────────
router.get('/my-section', guard, sectionCtrl.getMySection);
router.post('/announcements/create', guard, sectionCtrl.postCreateAnnouncement);
router.post('/announcements/:id/delete', guard, sectionCtrl.postDeleteAnnouncement);
router.post('/monitors/assign', guard, sectionCtrl.postAssignMonitor);
router.post('/monitors/remove', guard, sectionCtrl.postRemoveMonitor);

// ── Attendance ────────────────────────────────────────────────
router.get('/attendance', guard, sectionCtrl.getAttendance);
router.post('/attendance/mark', guard, sectionCtrl.postMarkAttendance);

// ── Timetable ─────────────────────────────────────────────────
router.get('/timetable', guard, sectionCtrl.getTeacherTimetable);

module.exports = router;

