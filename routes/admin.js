const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/adminController');
const { isAuthenticated, requireRole, requirePasswordReset } = require('../middleware/auth');

const guard = [isAuthenticated, requirePasswordReset, requireRole('school_admin')];

router.get('/dashboard', guard, ctrl.getDashboard);

router.get('/teachers', guard, ctrl.getTeachers);
router.get('/teachers/create', guard, ctrl.getCreateTeacher);
router.post('/teachers/create', guard, ctrl.postCreateTeacher);
router.post('/teachers/:id/delete', guard, ctrl.deleteUser);

router.get('/students', guard, ctrl.getStudents);
router.get('/students/create', guard, ctrl.getCreateStudent);
router.post('/students/create', guard, ctrl.postCreateStudent);
router.post('/students/:id/delete', guard, ctrl.deleteUser);

router.get('/admins', guard, ctrl.getAdmins);
router.get('/admins/create', guard, ctrl.getCreateAdmin);
router.post('/admins/create', guard, ctrl.postCreateAdmin);
router.post('/admins/:id/delete', guard, ctrl.deleteUser);

module.exports = router;
