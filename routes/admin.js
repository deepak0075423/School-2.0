const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/adminController');
const classCtrl = require('../controllers/classController');
const subjectCtrl = require('../controllers/subjectController');
const reportCtrl = require('../controllers/reportController');
const attendanceCtrl = require('../controllers/attendanceController');
const { isAuthenticated, requireRole, requirePasswordReset } = require('../middleware/auth');
const requireModule = require('../middleware/requireModule');
const upload = require('../middleware/upload');

const guard = [isAuthenticated, requirePasswordReset, requireRole('school_admin')];
const attendanceGuard = [...guard, requireModule('attendance')];

router.get('/dashboard', guard, ctrl.getDashboard);

// ── User Management ──────────────────────────────────────────
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
router.post('/academic-years/:id/delete', guard, classCtrl.postDeleteAcademicYear);

// ── Classes ───────────────────────────────────────────────────
router.get('/classes', guard, classCtrl.getClasses);
router.get('/classes/create', guard, classCtrl.getCreateClass);
router.post('/classes/create', guard, classCtrl.postCreateClass);
router.get('/classes/:classId', guard, classCtrl.getClassDetail);
router.post('/classes/:classId/delete', guard, classCtrl.postDeleteClass);

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

// ── Subjects ──────────────────────────────────────────────────
router.get('/subjects', guard, subjectCtrl.getSubjects);
router.post('/subjects/create', guard, subjectCtrl.postCreateSubject);
router.post('/subjects/:subjectId/delete', guard, subjectCtrl.postDeleteSubject);

// ── Reports ───────────────────────────────────────────────────
router.get('/reports', guard, reportCtrl.getReports);

// ── Teacher Regularization Requests ──────────────────────────
router.get('/regularization-requests', attendanceGuard, attendanceCtrl.getAdminRegularizationRequests);
router.post('/regularization-requests/review', attendanceGuard, attendanceCtrl.postAdminReviewRegularization);

// ── Notifications ─────────────────────────────────────────────
const notifCtrl = require('../controllers/notificationController');
router.get('/notifications',        guard, notifCtrl.getNotificationList);
router.get('/notifications/create', guard, notifCtrl.getCreateNotification);
router.post('/notifications/send',  guard, notifCtrl.postSendNotification);

module.exports = router;

