const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/teacherController');
const sectionCtrl = require('../controllers/sectionController');
const attendanceCtrl = require('../controllers/attendanceController');
const timetableCtrl = require('../controllers/timetableController');
const { isAuthenticated, requireRole, requirePasswordReset } = require('../middleware/auth');
const requireModule = require('../middleware/requireModule');

const guard = [isAuthenticated, requirePasswordReset, requireRole('teacher')];
const attendanceGuard = [...guard, requireModule('attendance')];
const timetableGuard = [...guard, requireModule('timetable')];

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
router.get('/timetable', timetableGuard, timetableCtrl.teacherViewTimetable);
router.get('/timetable/download', timetableGuard, timetableCtrl.teacherDownloadTimetable);

// ── Notifications ─────────────────────────────────────────────
const notifCtrl  = require('../controllers/notificationController');
const notifGuard = [...guard, requireModule('notification')];
router.get('/notifications',        notifGuard, notifCtrl.getNotificationList);
router.get('/notifications/create', notifGuard, notifCtrl.getCreateNotification);
router.post('/notifications/send',  notifGuard, notifCtrl.postSendNotification);

// ── Aptitude Exams ─────────────────────────────────────────────
const examCtrl  = require('../controllers/aptitudeExamController');
const examGuard = [...guard, requireModule('aptitudeExam')];
router.get('/exams',                           examGuard, examCtrl.getTeacherExams);
router.get('/exams/create',                    examGuard, examCtrl.getCreateExam);
router.post('/exams/create',                   examGuard, examCtrl.postCreateExam);
router.get('/exams/:id/edit',                  examGuard, examCtrl.getEditExam);
router.post('/exams/:id/edit',                 examGuard, examCtrl.postEditExam);
router.get('/exams/:id/questions',             examGuard, examCtrl.getManageQuestions);
router.post('/exams/:id/questions',            examGuard, examCtrl.postAddQuestion);
router.get('/exams/:id/questions/:qid/edit',  examGuard, examCtrl.getEditQuestion);
router.post('/exams/:id/questions/:qid/edit', examGuard, examCtrl.postEditQuestion);
router.post('/exams/:id/questions/:qid/delete',examGuard, examCtrl.postDeleteQuestion);
router.post('/exams/:id/publish',              examGuard, examCtrl.postPublishExam);
router.post('/exams/:id/delete',               examGuard, examCtrl.postDeleteExam);
router.get('/exams/:id/submissions',           examGuard, examCtrl.getSubmissions);
router.get('/exams/:id/submissions/:studentId',examGuard, examCtrl.getStudentResponse);
router.get('/exams/:id/analytics',             examGuard, examCtrl.getAnalytics);
router.get('/exams/:id/result-approval',            examGuard, examCtrl.getResultApproval);
router.post('/exams/:id/subject-approve',           examGuard, examCtrl.postSubjectApproveResults);
router.post('/exams/:id/result-approval',           examGuard, examCtrl.postApproveResults);

// ── Leave Management ──────────────────────────────────────────
const leaveCtrl      = require('../controllers/leaveController');
const uploadLeaveDoc = require('../middleware/uploadLeaveDoc');
const leaveGuard     = [...guard, requireModule('leave')];
router.get('/leave',                  leaveGuard, leaveCtrl.teacherGetMyLeaves);
router.get('/leave/balance',          leaveGuard, leaveCtrl.teacherGetLeaveBalance);
router.get('/leave/apply',            leaveGuard, leaveCtrl.teacherGetApplyLeave);
router.post('/leave/apply',           leaveGuard, uploadLeaveDoc.single('document'), leaveCtrl.teacherPostApplyLeave);
router.post('/leave/:id/cancel',      leaveGuard, leaveCtrl.teacherPostCancelLeave);

// ── Holiday Management ────────────────────────────────────────
const holidayCtrl  = require('../controllers/holidayController');
const holidayGuard = [...guard, requireModule('holiday')];
router.get('/holidays', holidayGuard, holidayCtrl.teacherGetHolidays);

// ── Result & Assessment Management ────────────────────────────
const formalExamCtrl  = require('../controllers/formalExamController');
const classTestCtrl   = require('../controllers/classTestController');
const resultGuard     = [...guard, requireModule('result')];

// Formal Exam — Subject Teacher (marks entry)
router.get('/results/marks-entry',                                    resultGuard, formalExamCtrl.teacherGetMarksEntry);
router.get('/results/marks-entry/:examId/:subjectId',                 resultGuard, formalExamCtrl.teacherGetMarksForm);
router.post('/results/marks-entry/:examId/:subjectId/save',           resultGuard, formalExamCtrl.teacherPostSaveMarks);

// Formal Exam — Class Teacher (validation)
router.get('/results/validation',                                     resultGuard, formalExamCtrl.teacherGetValidation);
router.get('/results/validation/:examId',                             resultGuard, formalExamCtrl.teacherGetValidationDetail);
router.post('/results/validation/:examId/approve',                    resultGuard, formalExamCtrl.teacherPostApproveExam);
router.post('/results/validation/:examId/reject',                     resultGuard, formalExamCtrl.teacherPostRejectExam);

// Class Tests — Subject Teacher
router.get('/results/class-tests',                                    resultGuard, classTestCtrl.teacherGetClassTests);
router.get('/results/class-tests/create',                             resultGuard, classTestCtrl.teacherGetCreateClassTest);
router.post('/results/class-tests/create',                            resultGuard, classTestCtrl.teacherPostCreateClassTest);
router.get('/results/class-tests/:id/marks',                          resultGuard, classTestCtrl.teacherGetTestMarks);
router.post('/results/class-tests/:id/marks/save',                    resultGuard, classTestCtrl.teacherPostSaveTestMarks);
router.post('/results/class-tests/:id/reopen',                        resultGuard, classTestCtrl.teacherPostReopenTest);

// Class Tests — Class Teacher (validation)
router.get('/results/class-test-validation',                          resultGuard, classTestCtrl.teacherGetClassTestValidation);
router.get('/results/class-test-validation/:id',                      resultGuard, classTestCtrl.teacherGetClassTestValidationDetail);
router.post('/results/class-test-validation/:id/approve',             resultGuard, classTestCtrl.teacherPostApproveClassTest);
router.post('/results/class-test-validation/:id/reject',              resultGuard, classTestCtrl.teacherPostRejectClassTest);

module.exports = router;

