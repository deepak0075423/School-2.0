const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/parentController');
const classCtrl = require('../controllers/parentClassController');
const { isAuthenticated, requireRole, requirePasswordReset } = require('../middleware/auth');

const guard = [isAuthenticated, requirePasswordReset, requireRole('parent')];

router.get('/dashboard', guard, ctrl.getDashboard);
router.get('/child-class', guard, classCtrl.getChildClass);

module.exports = router;

