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
const timetableGuard = [...guard, requireModule('timetable')];

router.get('/dashboard', guard, ctrl.getDashboard);
router.get('/my-class', guard, classCtrl.getMyClass);

// ── Timetable ─────────────────────────────────────────────────
router.get('/timetable', timetableGuard, timetableCtrl.studentViewTimetable);
router.get('/timetable/download', timetableGuard, timetableCtrl.studentDownloadTimetable);

// ── Attendance Calendar ───────────────────────────────────────
router.get('/my-attendance', attendanceGuard, attendanceCtrl.getStudentAttendanceCalendar);

// ── Correction Requests ───────────────────────────────────────
router.get('/correction', attendanceGuard, attendanceCtrl.getStudentCorrectionForm);
router.post('/correction/submit', attendanceGuard, attendanceCtrl.postSubmitStudentCorrection);

// ── Aptitude Exams ─────────────────────────────────────────────
const examCtrl  = require('../controllers/aptitudeExamController');
const examGuard = [...guard, requireModule('aptitudeExam')];
router.get('/exams',                    examGuard, examCtrl.getStudentExams);
router.get('/exams/:id/attempt',        examGuard, examCtrl.getAttemptExam);
router.post('/exams/:id/save-answer',   examGuard, examCtrl.postSaveAnswer);
router.post('/exams/:id/violation',     examGuard, examCtrl.postLogViolation);
router.post('/exams/:id/submit',        examGuard, examCtrl.postSubmitExam);
router.get('/exams/:id/result',         examGuard, examCtrl.getStudentResult);

// ── Holiday Management ────────────────────────────────────────
const holidayCtrl  = require('../controllers/holidayController');
const holidayGuard = [...guard, requireModule('holiday')];
router.get('/holidays', holidayGuard, holidayCtrl.studentGetHolidays);

// ── Result & Assessment Management ────────────────────────────
const formalExamCtrl = require('../controllers/formalExamController');
const classTestCtrl  = require('../controllers/classTestController');
const resultGuard    = [...guard, requireModule('result')];
router.get('/results',                  resultGuard, formalExamCtrl.studentGetResults);
router.get('/results/class-tests',      resultGuard, classTestCtrl.studentGetClassTests);
router.get('/results/:resultId',        resultGuard, formalExamCtrl.studentGetResultDetail);

module.exports = router;

