'use strict';
const ParentProfile  = require('../models/ParentProfile');
const StudentProfile = require('../models/StudentProfile');
const ClassSection   = require('../models/ClassSection');

exports.getDashboard = async (req, res) => {
    try {
        const User             = require('../models/User');
        const Attendance       = require('../models/Attendance');
        const AttendanceRecord = require('../models/AttendanceRecord');
        const FeeLedger        = require('../models/FeeLedger');
        const AcademicYear     = require('../models/AcademicYear');

        const parent = await ParentProfile.findOne({ user: req.userId }).lean();
        const childIds = parent?.children?.length ? parent.children : (parent?.student ? [parent.student] : []);

        const ay = await AcademicYear.findOne({ school: req.schoolId, status: 'active' }).lean();
        const now   = new Date();
        const start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));

        const children = [];
        for (const childId of childIds) {
            const [user, sp] = await Promise.all([
                User.findById(childId).select('name').lean(),
                StudentProfile.findOne({ user: childId })
                    .populate({ path: 'currentSection', select: 'sectionName class', populate: { path: 'class', select: 'className' } })
                    .lean(),
            ]);
            if (!user) continue;

            // Attendance % this month
            let attendance = null;
            if (sp?.currentSection) {
                const sessions = await Attendance.find({ section: sp.currentSection._id, date: { $gte: start } }).select('_id').lean();
                if (sessions.length) {
                    const records = await AttendanceRecord.find({
                        attendance: { $in: sessions.map(s => s._id) }, student: childId,
                    }).lean();
                    const present = records.filter(r => ['Present', 'Late'].includes(r.status)).length;
                    attendance = records.length ? Math.round((present / records.length) * 100) : null;
                }
            }

            const lastLedger = ay ? await FeeLedger.findOne({
                school: req.schoolId, student: childId, academicYear: ay._id,
            }).sort({ createdAt: -1 }).select('runningBalance').lean().catch(() => null) : null;

            children.push({
                _id:        childId,
                name:       user.name,
                className:  sp?.currentSection?.class?.className || '',
                sectionName:sp?.currentSection?.sectionName || '',
                rollNumber: sp?.rollNumber || '',
                attendancePercentage: attendance,
                feeBalance: lastLedger?.runningBalance ?? 0,
            });
        }

        res.json({ success: true, data: { parent, children } });
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
