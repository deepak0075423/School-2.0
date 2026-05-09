'use strict';
const StudentProfile = require('../models/StudentProfile');
const ClassSection   = require('../models/ClassSection');

exports.getDashboard = async (req, res) => {
    try {
        const profile = await StudentProfile.findOne({ user: req.userId })
            .populate('currentSection').lean();
        res.json({ success: true, data: { profile } });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
exports.getMyClass = async (req, res) => {
    try {
        const profile  = await StudentProfile.findOne({ user: req.userId }).lean();
        const section  = await ClassSection.findById(profile?.currentSection)
            .populate('class classTeacher').lean();
        res.json({ success: true, data: { profile, section } });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
