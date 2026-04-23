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

// ── Aptitude Exam Results ─────────────────────────────────────
const examCtrl  = require('../controllers/aptitudeExamController');
const examGuard = [...guard, requireModule('aptitudeExam')];
router.get('/exams', examGuard, examCtrl.getParentExamResults);

// ── Result & Assessment Management ────────────────────────────
const formalExamCtrl = require('../controllers/formalExamController');
const classTestCtrl  = require('../controllers/classTestController');
const resultGuard    = [...guard, requireModule('result')];
router.get('/results',                  resultGuard, formalExamCtrl.parentGetResults);
router.get('/results/class-tests',      resultGuard, classTestCtrl.parentGetClassTests);
router.get('/results/:resultId',        resultGuard, formalExamCtrl.parentGetResultDetail);

// ── Document Sharing ──────────────────────────────────────────
const docCtrl  = require('../controllers/documentController');
const docGuard = [...guard, requireModule('document')];
router.get('/documents',     docGuard, docCtrl.parentGetDocuments);
router.get('/documents/:id', docGuard, docCtrl.parentGetDocument);

// ── Holiday Management ────────────────────────────────────────
const holidayCtrl  = require('../controllers/holidayController');
const holidayGuard = [...guard, requireModule('holiday')];
router.get('/holidays', holidayGuard, holidayCtrl.parentGetHolidays);

module.exports = router;

