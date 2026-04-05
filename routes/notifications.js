/**
 * Shared notification routes — bell icon API + AJAX helpers.
 * Mounted at /notifications in app.js.
 * All routes require authentication (any role).
 */
const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/notificationController');
const { isAuthenticated, requirePasswordReset } = require('../middleware/auth');

const guard = [isAuthenticated, requirePasswordReset];

// Bell icon — inbox API
router.get('/api/inbox',                    guard, ctrl.getInboxApi);
router.post('/api/mark-all-read',           guard, ctrl.postMarkAllRead);
router.post('/api/clear-all',               guard, ctrl.postClearAll);
router.post('/api/:receiptId/mark-read',    guard, ctrl.postMarkOneRead);
router.post('/api/:receiptId/clear',        guard, ctrl.postClearOne);

// AJAX helper — sections for a given class (used in create form)
router.get('/api/classes/:classId/sections', guard, ctrl.getSectionsByClass);

module.exports = router;
