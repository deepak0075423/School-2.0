const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/adminController');
const classCtrl = require('../controllers/classController');
const subjectCtrl = require('../controllers/subjectController');
const reportCtrl = require('../controllers/reportController');
const attendanceCtrl = require('../controllers/attendanceController');
const timetableCtrl = require('../controllers/timetableController');
const { isAuthenticated, requireRole, requirePasswordReset } = require('../middleware/auth');
const requireModule = require('../middleware/requireModule');
const upload = require('../middleware/upload');

const guard = [isAuthenticated, requirePasswordReset, requireRole('school_admin')];
const attendanceGuard = [...guard, requireModule('attendance')];
const timetableGuard = [...guard, requireModule('timetable')];

router.get('/dashboard', guard, ctrl.getDashboard);

// ── User Management ──────────────────────────────────────────
router.post('/users/bulk-delete', guard, ctrl.postBulkDeleteUsers);
router.get('/users/:id/edit', guard, ctrl.getEditUser);
router.post('/users/:id/edit', guard, ctrl.postEditUser);

router.get('/teachers', guard, ctrl.getTeachers);
router.get('/teachers/create', guard, ctrl.getCreateTeacher);
router.post('/teachers/create', guard, ctrl.postCreateTeacher);
router.post('/teachers/bulk', guard, upload.single('excelFile'), ctrl.postBulkTeachers);
router.get('/teachers/template', guard, ctrl.downloadTeacherTemplate);
router.post('/teachers/:id/delete', guard, ctrl.deleteUser);

router.get('/students', guard, ctrl.getStudents);
router.get('/students/create', guard, ctrl.getCreateStudent);
router.post('/students/create', guard, ctrl.postCreateStudent);
router.post('/students/bulk', guard, upload.single('excelFile'), ctrl.postBulkStudents);
router.get('/students/template', guard, ctrl.downloadStudentTemplate);
router.post('/students/:id/delete', guard, ctrl.deleteUser);

router.get('/admins', guard, ctrl.getAdmins);
router.get('/admins/create', guard, ctrl.getCreateAdmin);
router.post('/admins/create', guard, ctrl.postCreateAdmin);
router.post('/admins/:id/delete', guard, ctrl.deleteUser);

// ── Academic Years ────────────────────────────────────────────
router.get('/academic-years', guard, classCtrl.getAcademicYears);
router.post('/academic-years/create', guard, classCtrl.postCreateAcademicYear);
router.get('/academic-years/:id/edit', guard, classCtrl.getEditAcademicYear);
router.post('/academic-years/:id/edit', guard, classCtrl.postEditAcademicYear);
router.post('/academic-years/:id/delete', guard, classCtrl.postDeleteAcademicYear);
router.post('/academic-years/:id/set-active', guard, classCtrl.postSetActiveAcademicYear);

// ── Classes ───────────────────────────────────────────────────
router.get('/classes', guard, classCtrl.getClasses);
router.get('/classes/create', guard, classCtrl.getCreateClass);
router.post('/classes/create', guard, classCtrl.postCreateClass);
router.get('/classes/:classId', guard, classCtrl.getClassDetail);
router.post('/classes/:classId/delete', guard, classCtrl.postDeleteClass);
router.post('/classes/auto-assign', guard, classCtrl.postAutoAssignStudents);

// Class → Sections
router.post('/classes/:classId/sections/create', guard, classCtrl.postCreateSection);
router.get('/classes/:classId/subjects', guard, subjectCtrl.getClassSubjects);
router.post('/classes/:classId/subjects/assign', guard, subjectCtrl.postAssignSubjectToClass);
router.post('/classes/:classId/subjects/remove', guard, subjectCtrl.postRemoveSubjectFromClass);

// ── Sections ──────────────────────────────────────────────────
router.get('/sections/:sectionId', guard, classCtrl.getSectionDetail);
router.post('/sections/:sectionId/assign-student', guard, classCtrl.postAssignStudentToSection);
router.post('/sections/:sectionId/remove-student', guard, classCtrl.postRemoveStudentFromSection);
router.post('/sections/:sectionId/update-teachers', guard, classCtrl.postUpdateSectionTeacher);
router.post('/sections/:sectionId/update-capacity', guard, classCtrl.postUpdateSectionCapacity);
router.post('/sections/:sectionId/delete', guard, classCtrl.postDeleteSection);
router.get('/sections/:sectionId/subjects', guard, subjectCtrl.getSectionSubjectTeachers);
router.post('/sections/:sectionId/subjects/assign', guard, subjectCtrl.postAssignSubjectTeacher);
router.post('/sections/:sectionId/subjects/:subjectId/remove', guard, subjectCtrl.postRemoveSectionSubject);

// Timetable
router.get('/sections/:sectionId/timetable', timetableGuard, timetableCtrl.adminManageTimetable);
router.post('/sections/:sectionId/timetable/structure', timetableGuard, timetableCtrl.adminSaveTimetableStructure);
router.get('/sections/:sectionId/timetable/entries', timetableGuard, timetableCtrl.adminAssignPeriods);
router.post('/sections/:sectionId/timetable/entries', timetableGuard, timetableCtrl.adminSaveEntries);
router.get('/sections/:sectionId/timetable/download', timetableGuard, timetableCtrl.adminDownloadSectionTimetable);
router.get('/timetable/download-all', timetableGuard, timetableCtrl.adminDownloadAllTimetables);
router.get('/api/timetable/teachers', timetableGuard, timetableCtrl.apiGetTeachersBySubject);

// ── Subjects ──────────────────────────────────────────────────
router.get('/subjects', guard, subjectCtrl.getSubjects);
router.post('/subjects/create', guard, subjectCtrl.postCreateSubject);
router.get('/subjects/:subjectId/edit', guard, subjectCtrl.getEditSubject);
router.post('/subjects/:subjectId/edit', guard, subjectCtrl.postEditSubject);
router.post('/subjects/:subjectId/delete', guard, subjectCtrl.postDeleteSubject);

// ── Reports ───────────────────────────────────────────────────
router.get('/reports', guard, reportCtrl.getReports);

// ── Teacher Regularization Requests ──────────────────────────
router.get('/regularization-requests', attendanceGuard, attendanceCtrl.getAdminRegularizationRequests);
router.post('/regularization-requests/review', attendanceGuard, attendanceCtrl.postAdminReviewRegularization);

// ── Notifications ─────────────────────────────────────────────
const notifCtrl   = require('../controllers/notificationController');
const notifGuard  = [...guard, requireModule('notification')];
router.get('/notifications',        notifGuard, notifCtrl.getNotificationList);
router.get('/notifications/create', notifGuard, notifCtrl.getCreateNotification);
router.post('/notifications/send',  notifGuard, notifCtrl.postSendNotification);

// ── Aptitude Exams ─────────────────────────────────────────────
const examCtrl  = require('../controllers/aptitudeExamController');
const examGuard = [...guard, requireModule('aptitudeExam')];
router.get('/exams', examGuard, examCtrl.getAdminExams);

// ── Result & Assessment Management ────────────────────────────
const formalExamCtrl = require('../controllers/formalExamController');
const resultGuard    = [...guard, requireModule('result')];
router.get('/results/exams',                              resultGuard, formalExamCtrl.adminGetExams);
router.get('/results/exams/create',                       resultGuard, formalExamCtrl.adminGetCreateExam);
router.post('/results/exams/create',                      resultGuard, formalExamCtrl.adminPostCreateExam);
router.get('/results/exams/:id/edit',                     resultGuard, formalExamCtrl.adminGetEditExam);
router.post('/results/exams/:id/edit',                    resultGuard, formalExamCtrl.adminPostEditExam);
router.post('/results/exams/:id/delete',                  resultGuard, formalExamCtrl.adminDeleteExam);
router.get('/results/exams/:id',                          resultGuard, formalExamCtrl.adminGetExamDetail);
router.get('/results/exams/:id/marks-review',             resultGuard, formalExamCtrl.adminGetMarksReview);
router.post('/results/exams/:id/approve',                 resultGuard, formalExamCtrl.adminPostApproveExam);
router.post('/results/exams/:id/reject',                  resultGuard, formalExamCtrl.adminPostRejectExam);
router.post('/results/exams/:id/reopen',                  resultGuard, formalExamCtrl.adminPostReopenExam);
router.post('/results/exams/:id/marks/:subjectId',        resultGuard, formalExamCtrl.adminPostEditMarks);
router.get('/results/exams/:id/result',                   resultGuard, formalExamCtrl.adminGetResult);
router.get('/api/results/sections/:sectionId/subjects',   resultGuard, formalExamCtrl.adminApiSectionSubjects);

// ── Leave Management ──────────────────────────────────────────
const leaveCtrl      = require('../controllers/leaveController');
const uploadLeaveDoc = require('../middleware/uploadLeaveDoc');
const leaveGuard     = [...guard, requireModule('leave')];
router.get('/leave/types',                      leaveGuard, leaveCtrl.adminGetLeaveTypes);
router.get('/leave/types/create',               leaveGuard, leaveCtrl.adminGetCreateLeaveType);
router.post('/leave/types/create',              leaveGuard, leaveCtrl.adminPostCreateLeaveType);
router.get('/leave/types/:id/edit',             leaveGuard, leaveCtrl.adminGetEditLeaveType);
router.post('/leave/types/:id/edit',            leaveGuard, leaveCtrl.adminPostEditLeaveType);
router.post('/leave/types/:id/delete',          leaveGuard, leaveCtrl.adminPostDeleteLeaveType);
router.post('/leave/settings',                  leaveGuard, leaveCtrl.adminPostLeaveSettings);
router.get('/leave/requests',                   leaveGuard, leaveCtrl.adminGetRequests);
router.get('/leave/requests/apply',             leaveGuard, leaveCtrl.adminGetApplyLeave);
router.post('/leave/requests/apply',            leaveGuard, leaveCtrl.adminPostApplyLeave);
router.get('/leave/api/balance',                leaveGuard, leaveCtrl.adminApiTeacherBalance);
router.post('/leave/requests/:id/approve',      leaveGuard, leaveCtrl.adminPostApproveRequest);
router.post('/leave/requests/:id/reject',       leaveGuard, leaveCtrl.adminPostRejectRequest);
router.post('/leave/requests/:id/modification', leaveGuard, leaveCtrl.adminPostRequestModification);
router.get('/leave/allocations',                leaveGuard, leaveCtrl.adminGetAllocations);
router.post('/leave/allocations',               leaveGuard, leaveCtrl.adminPostAllocate);
router.get('/leave/allocations/template',       leaveGuard, leaveCtrl.adminGetAllocationTemplate);
router.post('/leave/allocations/excel',         leaveGuard, upload.single('excelFile'), leaveCtrl.adminPostBulkAllocateExcel);
router.post('/leave/allocations/carry-forward', leaveGuard, leaveCtrl.adminPostRunCarryForward);
router.get('/leave/reports',                    leaveGuard, leaveCtrl.adminGetReports);
router.get('/leave/reports/export',             leaveGuard, leaveCtrl.adminExportReports);

// ── Holiday Management ────────────────────────────────────────
const holidayCtrl  = require('../controllers/holidayController');
const uploadCsv    = require('../middleware/uploadCsv');
const holidayGuard = [...guard, requireModule('holiday')];
router.get('/holidays',                holidayGuard, holidayCtrl.adminGetHolidays);
router.get('/holidays/create',         holidayGuard, holidayCtrl.adminGetCreateHoliday);
router.post('/holidays/create',        holidayGuard, holidayCtrl.adminPostCreateHoliday);
router.get('/holidays/import',         holidayGuard, holidayCtrl.adminGetImportHolidays);
router.post('/holidays/import',        holidayGuard, uploadCsv.single('csvFile'), holidayCtrl.adminPostImportHolidays);
router.get('/holidays/export',         holidayGuard, holidayCtrl.adminGetExportHolidays);
router.get('/holidays/template',       holidayGuard, holidayCtrl.adminGetImportTemplate);
router.get('/holidays/audit',          holidayGuard, holidayCtrl.adminGetAuditLog);
router.get('/holidays/:id/edit',       holidayGuard, holidayCtrl.adminGetEditHoliday);
router.post('/holidays/:id/edit',      holidayGuard, holidayCtrl.adminPostEditHoliday);
router.post('/holidays/:id/delete',    holidayGuard, holidayCtrl.adminPostDeleteHoliday);

module.exports = router;

