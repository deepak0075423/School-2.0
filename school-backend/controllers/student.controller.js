'use strict';
const StudentProfile = require('../models/StudentProfile');
const ClassSection   = require('../models/ClassSection');

exports.getDashboard = async (req, res) => {
    try {
        const Attendance       = require('../models/Attendance');
        const AttendanceRecord = require('../models/AttendanceRecord');
        const AptitudeExam     = require('../models/AptitudeExam');
        const FeeLedger        = require('../models/FeeLedger');
        const AcademicYear     = require('../models/AcademicYear');

        const profile = await StudentProfile.findOne({ user: req.userId })
            .populate({ path: 'currentSection', populate: { path: 'class', select: 'className' } })
            .lean();

        // Attendance this month
        let attendance = null;
        if (profile?.currentSection) {
            const now   = new Date();
            const start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
            const sessions = await Attendance.find({
                section: profile.currentSection._id, date: { $gte: start },
            }).select('_id').lean();
            if (sessions.length) {
                const records = await AttendanceRecord.find({
                    attendance: { $in: sessions.map(s => s._id) }, student: req.userId,
                }).lean();
                const present = records.filter(r => ['Present', 'Late'].includes(r.status)).length;
                attendance = {
                    total: records.length, present,
                    percentage: records.length ? Math.round((present / records.length) * 100) : null,
                };
            }
        }

        // Upcoming published aptitude exams
        const upcomingExams = profile?.currentSection
            ? await AptitudeExam.find({
                school: req.schoolId, section: profile.currentSection._id,
                status: 'published', examDate: { $gte: new Date(Date.now() - 86400000) },
              }).select('title examDate startTime duration').sort({ examDate: 1 }).limit(3).lean().catch(() => [])
            : [];

        // Outstanding fee balance
        const ay = await AcademicYear.findOne({ school: req.schoolId, status: 'active' }).lean();
        const lastLedger = ay ? await FeeLedger.findOne({
            school: req.schoolId, student: req.userId, academicYear: ay._id,
        }).sort({ createdAt: -1 }).select('runningBalance').lean().catch(() => null) : null;

        res.json({ success: true, data: {
            profile,
            attendance,
            upcomingExams,
            feeBalance: lastLedger?.runningBalance ?? 0,
        }});
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
