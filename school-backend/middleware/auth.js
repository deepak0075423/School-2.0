'use strict';
const jwt  = require('jsonwebtoken');
const User = require('../models/User');

const verifyToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') && authHeader.slice(7);

    if (!token) {
        return res.status(401).json({ success: false, message: 'Access token required' });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).populate('school').lean();
        if (!user || !user.isActive) {
            return res.status(401).json({ success: false, message: 'User not found or inactive' });
        }
        req.user    = user;
        req.userId  = user._id;
        req.schoolId = user.school?._id || user.school;
        req.userRole = user.role;
        next();
    } catch (err) {
        const message = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
        return res.status(401).json({ success: false, message });
    }
};

const requireRole = (...roles) => (req, res, next) => {
    if (!roles.includes(req.userRole)) {
        return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }
    next();
};

const requirePasswordReset = (req, res, next) => {
    if (req.user?.isFirstLogin) {
        return res.status(403).json({
            success: false,
            message: 'Password reset required',
            code: 'PASSWORD_RESET_REQUIRED',
        });
    }
    next();
};

module.exports = { verifyToken, requireRole, requirePasswordReset };
