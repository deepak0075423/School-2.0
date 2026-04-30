const StudentProfile = require('../models/StudentProfile');
const ClassSection = require('../models/ClassSection');
const Attendance = require('../models/Attendance');
const AttendanceRecord = require('../models/AttendanceRecord');
const Holiday = require('../models/Holiday');

const getDashboard = async (req, res) => {
    try {
        const profile = await StudentProfile.findOne({ user: req.session.userId })
            .populate('parent').populate('school');

        const schoolModules = (res.locals.currentUser && res.locals.currentUser.school && res.locals.currentUser.school.modules) || {};

        let calendarHolidays = [], upcomingHolidays = [];
        if (schoolModules.holiday) {
            const now = new Date();
            const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            [calendarHolidays, upcomingHolidays] = await Promise.all([
                Holiday.find({ school: req.session.schoolId }).sort({ startDate: 1 }).lean(),
                Holiday.find({ school: req.session.schoolId, endDate: { $gte: now }, startDate: { $lte: in30Days } })
                    .sort({ startDate: 1 }).limit(5).lean(),
            ]);
        }

        // Attendance map for calendar: { 'YYYY-MM-DD': 'Present'|'Absent'|'Late' }
        let attendanceMap = {}, attendanceStats = null;
        if (schoolModules.attendance) {
            const section = await ClassSection.findOne({
                enrolledStudents: req.session.userId,
                school: req.session.schoolId,
            }).lean();

            if (section) {
                const sessions = await Attendance.find({ section: section._id }).lean();
                const sessionIds = sessions.map(s => s._id);
                const records = await AttendanceRecord.find({
                    attendance: { $in: sessionIds },
                    student: req.session.userId,
                }).lean();

                const sessionDateMap = {};
                sessions.forEach(s => { sessionDateMap[s._id.toString()] = s.date; });

                records.forEach(r => {
                    const date = sessionDateMap[r.attendance.toString()];
                    if (date) attendanceMap[new Date(date).toISOString().split('T')[0]] = r.status;
                });

                // Sessions with no record → teacher took attendance but student unmarked → treat as Absent
                sessions.forEach(s => {
                    const dateStr = new Date(s.date).toISOString().split('T')[0];
                    if (!attendanceMap[dateStr]) attendanceMap[dateStr] = 'Absent';
                });

                const total   = records.length;
                const present = records.filter(r => r.status === 'Present').length;
                attendanceStats = { percentage: total > 0 ? Math.round((present / total) * 100) : null };
            }
        }

        res.render('student/dashboard', {
            title: 'Student Dashboard',
            layout: 'layouts/main',
            profile,
            hasHoliday: !!schoolModules.holiday,
            calendarHolidays,
            upcomingHolidays,
            holidayViewUrl: '/student/holidays',
            hasAttendance: !!schoolModules.attendance,
            attendanceMap,
            attendanceStats,
        });
    } catch (err) {
        console.error(err);
        res.render('student/dashboard', {
            title: 'Student Dashboard', layout: 'layouts/main',
            profile: null,
            hasHoliday: false, calendarHolidays: [], upcomingHolidays: [], holidayViewUrl: '/student/holidays',
            hasAttendance: false, attendanceMap: {}, attendanceStats: null,
        });
    }
};

module.exports = { getDashboard };
