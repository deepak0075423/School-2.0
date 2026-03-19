const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { sendOtpEmail } = require('../utils/sendEmail');
const crypto = require('crypto');

// GET /auth/login
const getLogin = (req, res) => {
    if (req.session && req.session.userId) {
        return redirectByRole(res, req.session.userRole);
    }
    res.render('auth/login', { title: 'Login', layout: 'layouts/auth' });
};

// POST /auth/login
const postLogin = async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email: email.toLowerCase().trim() }).populate('school');
        if (!user) {
            req.flash('error', 'Invalid email or password.');
            return res.redirect('/auth/login');
        }
        if (!user.isActive) {
            req.flash('error', 'Your account has been deactivated. Contact your administrator.');
            return res.redirect('/auth/login');
        }
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            req.flash('error', 'Invalid email or password.');
            return res.redirect('/auth/login');
        }

        // Set session
        req.session.userId = user._id.toString();
        req.session.userRole = user.role;
        req.session.userName = user.name;
        req.session.userEmail = user.email;
        req.session.schoolId = user.school ? user.school._id.toString() : null;
        req.session.schoolName = user.school ? user.school.name : null;
        req.session.profileImage = user.profileImage || null;
        req.session.isFirstLogin = user.isFirstLogin;

        // Save session BEFORE redirecting to avoid race condition
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                req.flash('error', 'Server error. Please try again.');
                return res.redirect('/auth/login');
            }
            if (user.isFirstLogin) {
                return res.redirect('/auth/reset-password');
            }
            redirectByRole(res, user.role);
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Server error. Please try again.');
        res.redirect('/auth/login');
    }
};

// GET /auth/reset-password
const getResetPassword = (req, res) => {
    if (!req.session || !req.session.userId) {
        return res.redirect('/auth/login');
    }
    res.render('auth/reset-password', { title: 'Set New Password', layout: 'layouts/auth' });
};

// POST /auth/reset-password
const postResetPassword = async (req, res) => {
    const { password, confirmPassword } = req.body;
    if (!req.session || !req.session.userId) {
        return res.redirect('/auth/login');
    }
    if (password !== confirmPassword) {
        req.flash('error', 'Passwords do not match.');
        return res.redirect('/auth/reset-password');
    }
    if (password.length < 8) {
        req.flash('error', 'Password must be at least 8 characters long.');
        return res.redirect('/auth/reset-password');
    }
    try {
        // Hash manually and write directly — bypasses pre-save hook (verified approach)
        const salt = await bcrypt.genSalt(12);
        const hashed = await bcrypt.hash(password, salt);
        await User.updateOne(
            { _id: req.session.userId },
            { $set: { password: hashed, isFirstLogin: false } }
        );
        req.session.isFirstLogin = false;

        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                req.flash('error', 'Server error. Please try again.');
                return res.redirect('/auth/reset-password');
            }
            req.flash('success', 'Password updated successfully! Welcome aboard.');
            redirectByRole(res, req.session.userRole);
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Server error. Please try again.');
        res.redirect('/auth/reset-password');

    }
};

// GET /auth/logout
const logout = (req, res) => {
    req.session.destroy(() => {
        res.redirect('/auth/login');
    });
};

const redirectByRole = (res, role) => {
    const routes = {
        super_admin: '/super-admin/dashboard',
        school_admin: '/admin/dashboard',
        teacher: '/teacher/dashboard',
        student: '/student/dashboard',
        parent: '/parent/dashboard',
    };
    res.redirect(routes[role] || '/auth/login');
};

// --- FORGOT PASSWORD (OTP FLOW) ---

// GET /auth/forgot-password
const getForgotPassword = (req, res) => {
    res.render('auth/forgot-password', { title: 'Forgot Password', layout: 'layouts/auth' });
};

// POST /auth/forgot-password — generates + emails OTP
const postForgotPassword = async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email: email.toLowerCase().trim() });
        // Always show success to prevent email enumeration
        if (!user) {
            req.flash('success', 'If that email exists, an OTP has been sent.');
            return res.redirect('/auth/forgot-password');
        }

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Store OTP directly (plain, for simplicity — short-lived)
        await User.updateOne(
            { _id: user._id },
            { $set: { otp, otpExpiry } }
        );

        await sendOtpEmail({ to: user.email, name: user.name, otp });

        // Store reset email in session for subsequent steps
        req.session.resetEmail = user.email;
        req.session.save(() => {
            req.flash('success', 'An OTP has been sent to your email. It expires in 10 minutes.');
            res.redirect('/auth/verify-otp');
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to send OTP. Please try again.');
        res.redirect('/auth/forgot-password');
    }
};

// GET /auth/verify-otp
const getVerifyOtp = (req, res) => {
    if (!req.session.resetEmail) return res.redirect('/auth/forgot-password');
    res.render('auth/verify-otp', { title: 'Enter OTP', layout: 'layouts/auth' });
};

// POST /auth/verify-otp
const postVerifyOtp = async (req, res) => {
    const { otp } = req.body;
    const email = req.session.resetEmail;
    if (!email) return res.redirect('/auth/forgot-password');

    try {
        const user = await User.findOne({ email });
        if (!user || !user.otp || !user.otpExpiry) {
            req.flash('error', 'OTP not found. Please request a new one.');
            return res.redirect('/auth/forgot-password');
        }
        if (new Date() > user.otpExpiry) {
            await User.updateOne({ _id: user._id }, { $set: { otp: null, otpExpiry: null } });
            req.flash('error', 'OTP has expired. Please request a new one.');
            return res.redirect('/auth/forgot-password');
        }
        if (otp.trim() !== user.otp) {
            req.flash('error', 'Invalid OTP. Please try again.');
            return res.redirect('/auth/verify-otp');
        }

        // OTP verified — allow password reset
        req.session.otpVerified = true;
        req.session.save(() => res.redirect('/auth/new-password'));
    } catch (err) {
        console.error(err);
        req.flash('error', 'Verification failed. Please try again.');
        res.redirect('/auth/verify-otp');
    }
};

// GET /auth/new-password
const getNewPassword = (req, res) => {
    if (!req.session.resetEmail || !req.session.otpVerified) {
        return res.redirect('/auth/forgot-password');
    }
    res.render('auth/new-password', { title: 'Set New Password', layout: 'layouts/auth' });
};

// POST /auth/new-password
const postNewPassword = async (req, res) => {
    const { password, confirmPassword } = req.body;
    const email = req.session.resetEmail;

    if (!email || !req.session.otpVerified) return res.redirect('/auth/forgot-password');

    if (password !== confirmPassword) {
        req.flash('error', 'Passwords do not match.');
        return res.redirect('/auth/new-password');
    }
    if (password.length < 8) {
        req.flash('error', 'Password must be at least 8 characters.');
        return res.redirect('/auth/new-password');
    }

    try {
        const user = await User.findOne({ email });
        if (!user) return res.redirect('/auth/forgot-password');

        // Hash and save new password, clear OTP
        const salt = await bcrypt.genSalt(12);
        const hashed = await bcrypt.hash(password, salt);
        await User.updateOne(
            { _id: user._id },
            { $set: { password: hashed, otp: null, otpExpiry: null, isFirstLogin: false } }
        );

        // Clean up session
        delete req.session.resetEmail;
        delete req.session.otpVerified;
        req.session.save(() => {
            req.flash('success', 'Password reset successfully! You can now log in.');
            res.redirect('/auth/login');
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to reset password. Please try again.');
        res.redirect('/auth/new-password');
    }
};

// GET /auth/magic/:token — one-time magic login link (generated by super admin)
const getMagicLogin = async (req, res) => {
    try {
        const { token } = req.params;
        const user = await User.findOne({
            loginToken: token,
            loginTokenExpiry: { $gt: new Date() },
        }).populate('school');

        if (!user) {
            req.flash('error', 'This login link is invalid or has expired.');
            return res.redirect('/auth/login');
        }

        // Invalidate token immediately (one-time use)
        await User.updateOne(
            { _id: user._id },
            { $set: { loginToken: null, loginTokenExpiry: null } }
        );

        // Establish full session
        req.session.userId = user._id.toString();
        req.session.userRole = user.role;
        req.session.userName = user.name;
        req.session.userEmail = user.email;
        req.session.schoolId = user.school ? user.school._id.toString() : null;
        req.session.schoolName = user.school ? user.school.name : null;
        req.session.profileImage = user.profileImage || null;
        req.session.isFirstLogin = user.isFirstLogin;

        req.session.save((err) => {
            if (err) {
                console.error('Magic login session error:', err);
                req.flash('error', 'Login failed. Please try again.');
                return res.redirect('/auth/login');
            }
            req.flash('success', `Logged in as ${user.name} via one-time link.`);
            if (user.isFirstLogin) return res.redirect('/auth/reset-password');
            redirectByRole(res, user.role);
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Login link failed. Please try again.');
        res.redirect('/auth/login');
    }
};

module.exports = {
    getLogin, postLogin, getResetPassword, postResetPassword, logout,
    getForgotPassword, postForgotPassword,
    getVerifyOtp, postVerifyOtp,
    getNewPassword, postNewPassword,
    getMagicLogin,
};
