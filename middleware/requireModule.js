/**
 * requireModule(moduleName)
 *
 * Middleware factory that gates a route behind a school-level feature flag.
 * Relies on res.locals.currentUser being populated by the loadUser middleware
 * (which runs on every request and populates user.school via .populate('school')).
 *
 * Usage:
 *   const requireModule = require('../middleware/requireModule');
 *   router.get('/attendance', guard, requireModule('attendance'), ctrl.handler);
 *
 * If the school has not enabled the module, the user sees a clean "Module Not Enabled"
 * page instead of a 403/404. Super admins are never blocked.
 */

const MODULE_LABELS = {
    attendance: 'Attendance Management',
    // add future module labels here
};

const requireModule = (moduleName) => (req, res, next) => {
    // Super admins are never gated
    if (req.session && req.session.userRole === 'super_admin') return next();

    const school = res.locals.currentUser && res.locals.currentUser.school;

    if (!school) {
        // No school linked to user — treat as disabled
        return res.render('module-disabled', {
            title: 'Module Not Available',
            layout: 'layouts/main',
            moduleName: MODULE_LABELS[moduleName] || moduleName,
            schoolName: null,
        });
    }

    if (!school.modules || !school.modules[moduleName]) {
        return res.render('module-disabled', {
            title: 'Module Not Available',
            layout: 'layouts/main',
            moduleName: MODULE_LABELS[moduleName] || moduleName,
            schoolName: school.name,
        });
    }

    next();
};

module.exports = requireModule;
