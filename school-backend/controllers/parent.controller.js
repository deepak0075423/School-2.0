'use strict';
const ParentProfile  = require('../models/ParentProfile');
const StudentProfile = require('../models/StudentProfile');
const ClassSection   = require('../models/ClassSection');

exports.getDashboard = async (req, res) => {
    try {
        const parent  = await ParentProfile.findOne({ user: req.userId }).lean();
        res.json({ success: true, data: { parent } });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
exports.getChildClass = async (req, res) => {
    try {
        const parent   = await ParentProfile.findOne({ user: req.userId }).lean();
        const student  = await StudentProfile.findOne({ user: parent?.student }).lean();
        const section  = await ClassSection.findById(student?.currentSection)
            .populate('class classTeacher').lean();
        res.json({ success: true, data: { student, section } });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
