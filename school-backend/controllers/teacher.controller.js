'use strict';
const User           = require('../models/User');
const TeacherProfile = require('../models/TeacherProfile');

exports.getDashboard = async (req, res) => {
    try {
        const profile = await TeacherProfile.findOne({ user: req.userId }).lean();
        res.json({ success: true, data: { profile } });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
