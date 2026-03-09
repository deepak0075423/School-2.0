const AcademicYear = require('../models/AcademicYear');
const Class = require('../models/Class');
const ClassSection = require('../models/ClassSection');
const StudentProfile = require('../models/StudentProfile');
const ClassMonitor = require('../models/ClassMonitor');
const SectionSubjectTeacher = require('../models/SectionSubjectTeacher');
const Attendance = require('../models/Attendance');
const AttendanceRecord = require('../models/AttendanceRecord');
const User = require('../models/User');

const getReports = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;

        // 1. Students per class
        const classes = await Class.find({ school: schoolId })
            .populate('academicYear', 'yearName').sort({ classNumber: 1 });
        const sectionsAll = await ClassSection.find({ school: schoolId });
        const studentsPerClass = classes.map(cls => {
            const classSections = sectionsAll.filter(s => s.class.toString() === cls._id.toString());
            const total = classSections.reduce((sum, s) => sum + s.currentCount, 0);
            return { cls, total, sections: classSections.length };
        });

        // 2. Students per section
        const sections = await ClassSection.find({ school: schoolId })
            .populate('class', 'className classNumber')
            .populate('classTeacher', 'name')
            .sort({ sectionName: 1 });

        // 3. Teachers and their sections
        const teachers = await User.find({ role: 'teacher', school: schoolId, isActive: true }).select('name email');
        const teacherSections = await Promise.all(teachers.map(async (t) => {
            const secs = await ClassSection.find({ school: schoolId, $or: [{ classTeacher: t._id }, { substituteTeacher: t._id }] })
                .populate('class', 'className');
            return { teacher: t, sections: secs };
        }));

        // 4. Class monitors list
        const monitors = await ClassMonitor.find({ status: 'active' })
            .populate({ path: 'section', match: { school: schoolId }, populate: { path: 'class', select: 'className' } })
            .populate('student', 'name email')
            .populate('assignedBy', 'name');
        const validMonitors = monitors.filter(m => m.section);

        // 5. Capacity usage
        const capacityData = sections.map(s => ({
            section: s,
            used: s.currentCount,
            max: s.maxStudents,
            pct: Math.round((s.currentCount / s.maxStudents) * 100),
        }));

        // 6. Attendance summary (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const recentAttendances = await Attendance.find({ date: { $gte: sevenDaysAgo } })
            .populate({ path: 'section', match: { school: schoolId }, populate: { path: 'class', select: 'className' } });
        const validAttendances = recentAttendances.filter(a => a.section);
        const attendanceSummary = await Promise.all(validAttendances.map(async (a) => {
            const records = await AttendanceRecord.find({ attendance: a._id });
            const present = records.filter(r => r.status === 'Present').length;
            const absent = records.filter(r => r.status === 'Absent').length;
            const late = records.filter(r => r.status === 'Late').length;
            return { attendance: a, present, absent, late, total: records.length };
        }));

        res.render('admin/reports/index', {
            title: 'Reports', layout: 'layouts/main',
            studentsPerClass, sections, teacherSections,
            validMonitors, capacityData, attendanceSummary,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to generate reports.'); res.redirect('/admin/dashboard');
    }
};

module.exports = { getReports };
