const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/teacherController');
const { isAuthenticated, requireRole, requirePasswordReset } = require('../middleware/auth');

const guard = [isAuthenticated, requirePasswordReset, requireRole('teacher')];
router.get('/dashboard', guard, ctrl.getDashboard);

module.exports = router;
