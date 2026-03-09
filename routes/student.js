const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/studentController');
const classCtrl = require('../controllers/studentClassController');
const { isAuthenticated, requireRole, requirePasswordReset } = require('../middleware/auth');

const guard = [isAuthenticated, requirePasswordReset, requireRole('student')];

router.get('/dashboard', guard, ctrl.getDashboard);
router.get('/my-class', guard, classCtrl.getMyClass);

module.exports = router;

