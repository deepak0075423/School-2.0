const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/superAdminController');
const { isAuthenticated, requireRole, requirePasswordReset } = require('../middleware/auth');

const guard = [isAuthenticated, requirePasswordReset, requireRole('super_admin')];

router.get('/dashboard', guard, ctrl.getDashboard);

router.get('/schools', guard, ctrl.getSchools);
router.get('/schools/create', guard, ctrl.getCreateSchool);
router.post('/schools/create', guard, ctrl.postCreateSchool);
router.post('/schools/:id/delete', guard, ctrl.deleteSchool);

router.get('/users', guard, ctrl.getUsers);
router.get('/users/create', guard, ctrl.getCreateUser);
router.post('/users/create', guard, ctrl.postCreateUser);
router.post('/users/:id/toggle', guard, ctrl.toggleUserStatus);
router.post('/users/:id/delete', guard, ctrl.deleteUser);
router.post('/users/:id/login-link', guard, ctrl.postGenerateLoginLink);

module.exports = router;
