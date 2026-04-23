require('dotenv').config();
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const expressLayouts = require('express-ejs-layouts');
const methodOverride = require('method-override');
const path = require('path');
const { loadUser } = require('./middleware/auth');

const app = express();

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Body parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Method override for DELETE/PUT from forms
app.use(methodOverride('_method'));

// Session
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
}));

// Flash messages
app.use(flash());

// Load current user & expose to all views
app.use(loadUser);

// Expose librarian flag and teacher-fine policy for nav rendering
const TeacherProfile = require('./models/TeacherProfile');
const LibraryPolicy  = require('./models/LibraryPolicy');
app.use(async (req, res, next) => {
    res.locals.isLibrarian          = false;
    res.locals.teacherFinesEnabled  = false;
    if (req.session && req.session.userRole === 'teacher' && req.session.userId) {
        try {
            const tp = await TeacherProfile.findOne({ user: req.session.userId, school: req.session.schoolId }).select('designation');
            res.locals.isLibrarian = !!(tp && tp.designation === 'Librarian');
            if (!res.locals.isLibrarian) {
                const pol = await LibraryPolicy.findOne({ school: req.session.schoolId }).select('teacherFinesEnabled');
                res.locals.teacherFinesEnabled = !!(pol && pol.teacherFinesEnabled);
            }
        } catch { /* non-fatal */ }
    }
    next();
});
app.use((req, res, next) => {
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    res.locals.appName = process.env.APP_NAME || 'School Management System';
    res.locals.session = req.session;
    next();
});

// Global notification count injected into every authenticated view
const NotificationReceipt = require('./models/NotificationReceipt');
app.use(async (req, res, next) => {
    res.locals.unreadNotificationCount = 0;
    if (req.session && req.session.userId) {
        try {
            res.locals.unreadNotificationCount = await NotificationReceipt.countDocuments({
                recipient: req.session.userId,
                isRead: false,
                isCleared: false,
            });
        } catch { /* non-fatal */ }
    }
    next();
});

// Routes
app.use('/auth', require('./routes/auth'));
app.use('/super-admin', require('./routes/superAdmin'));
app.use('/admin', require('./routes/admin'));
app.use('/teacher', require('./routes/teacher'));
app.use('/student', require('./routes/student'));
app.use('/parent', require('./routes/parent'));
app.use('/profile', require('./routes/profile'));
app.use('/notifications', require('./routes/notifications'));
app.use('/library', require('./routes/library'));

// Home → redirect to login
app.get('/', (req, res) => {
    if (req.session && req.session.userId) {
        const routes = {
            super_admin: '/super-admin/dashboard',
            school_admin: '/admin/dashboard',
            teacher: '/teacher/dashboard',
            student: '/student/dashboard',
            parent: '/parent/dashboard',
        };
        return res.redirect(routes[req.session.userRole] || '/auth/login');
    }
    res.redirect('/auth/login');
});

// 404 handler
app.use((req, res) => {
    res.status(404).render('404', {
        title: '404 — Page Not Found',
        layout: 'layouts/main',
    });
});

// 500 handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', {
        title: '500 — Server Error',
        message: 'Something went wrong on our end. Please try again.',
        layout: 'layouts/main',
    });
});

module.exports = app;
