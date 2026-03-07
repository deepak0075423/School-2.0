const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/parentController');
const { isAuthenticated, requireRole, requirePasswordReset } = require('../middleware/auth');

const guard = [isAuthenticated, requirePasswordReset, requireRole('parent')];
router.get('/dashboard', guard, ctrl.getDashboard);

module.exports = router;
