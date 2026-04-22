const User             = require('../models/User');
const TeacherProfile   = require('../models/TeacherProfile');
const StudentProfile   = require('../models/StudentProfile');
const Holiday          = require('../models/Holiday');
const LeaveApplication = require('../models/LeaveApplication');

const getDashboard = async (req, res) => {
    try {
        const profile = await TeacherProfile.findOne({ user: req.session.userId });
        const studentsInClasses = profile ? await StudentProfile.find({
            school: req.session.schoolId,
            class: { $in: profile.classes },
        }).populate('user') : [];

        const schoolModules = (req.user && req.user.school && req.user.school.modules) || {};
        let calendarHolidays = [], upcomingHolidays = [], approvedLeaves = [];
        if (schoolModules.holiday) {
            const now = new Date();
            const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            [calendarHolidays, upcomingHolidays] = await Promise.all([
                Holiday.find({ school: req.session.schoolId }).sort({ startDate: 1 }).lean(),
                Holiday.find({ school: req.session.schoolId, endDate: { $gte: now }, startDate: { $lte: in30Days } })
                    .sort({ startDate: 1 }).limit(5).lean(),
            ]);
        }
        if (schoolModules.leave) {
            approvedLeaves = await LeaveApplication.find({
                teacher: req.session.userId,
                school: req.session.schoolId,
                status: 'approved',
            }).populate('leaveType', 'name').lean();
        }

        res.render('teacher/dashboard', {
            title: 'Teacher Dashboard',
            layout: 'layouts/main',
            profile,
            students: studentsInClasses,
            hasHoliday: !!schoolModules.holiday,
            hasLeave: !!schoolModules.leave,
            calendarHolidays,
            upcomingHolidays,
            approvedLeaves,
            holidayViewUrl: '/teacher/holidays',
        });
    } catch (err) {
        console.error(err);
        res.render('teacher/dashboard', {
            title: 'Teacher Dashboard', layout: 'layouts/main',
            profile: null, students: [],
            hasHoliday: false, hasLeave: false,
            calendarHolidays: [], upcomingHolidays: [], approvedLeaves: [],
            holidayViewUrl: '/teacher/holidays',
        });
    }
};

module.exports = { getDashboard };
