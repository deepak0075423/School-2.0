const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Check if user is authenticated via session
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.userId) {
        return next();
    }
    req.flash('error', 'Please log in to access this page.');
    res.redirect('/auth/login');
};

const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.session || !req.session.userId) {
            req.flash('error', 'Please log in to access this page.');
            return res.redirect('/auth/login');
        }
        if (!roles.includes(req.session.userRole)) {
            return res.status(403).render('403', {
                title: '403 — Access Denied',
                layout: 'layouts/main',
                requiredRole: roles.join(' or '),
            });
        }
        next();
    };
};

// Load current user into req.user for all authenticated routes
const loadUser = async (req, res, next) => {
    res.locals.currentUser = null;
    res.locals.userRole = null;
    if (req.session && req.session.userId) {
        try {
            const user = await User.findById(req.session.userId).populate('school');
            if (user) {
                req.user = user;
                res.locals.currentUser = user;
                res.locals.userRole = user.role;
            }
        } catch (err) {
            // ignore
        }
    }
    next();
};

// Force password reset on first login
const requirePasswordReset = (req, res, next) => {
    if (req.session && req.session.isFirstLogin) {
        return res.redirect('/auth/reset-password');
    }
    next();
};

module.exports = { isAuthenticated, requireRole, loadUser, requirePasswordReset };
