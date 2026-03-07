const express = require('express');
const router = express.Router();
const { getLogin, postLogin, getResetPassword, postResetPassword, logout,
    getForgotPassword, postForgotPassword,
    getVerifyOtp, postVerifyOtp,
    getNewPassword, postNewPassword,
    getMagicLogin } = require('../controllers/authController');
const { isAuthenticated } = require('../middleware/auth');

router.get('/login', getLogin);
router.post('/login', postLogin);
router.get('/reset-password', isAuthenticated, getResetPassword);
router.post('/reset-password', isAuthenticated, postResetPassword);
router.get('/logout', logout);

// OTP Password Reset
router.get('/forgot-password', getForgotPassword);
router.post('/forgot-password', postForgotPassword);
router.get('/verify-otp', getVerifyOtp);
router.post('/verify-otp', postVerifyOtp);
router.get('/new-password', getNewPassword);
router.post('/new-password', postNewPassword);

// One-time magic login (public — no auth guard)
router.get('/magic/:token', getMagicLogin);

module.exports = router;
