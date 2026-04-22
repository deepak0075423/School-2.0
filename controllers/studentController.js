const StudentProfile = require('../models/StudentProfile');
const Holiday = require('../models/Holiday');

const getDashboard = async (req, res) => {
    try {
        const profile = await StudentProfile.findOne({ user: req.session.userId })
            .populate('parent').populate('school');

        const schoolModules = (req.user && req.user.school && req.user.school.modules) || {};
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

        res.render('student/dashboard', {
            title: 'Student Dashboard',
            layout: 'layouts/main',
            profile,
            hasHoliday: !!schoolModules.holiday,
            calendarHolidays,
            upcomingHolidays,
            holidayViewUrl: '/student/holidays',
        });
    } catch (err) {
        console.error(err);
        res.render('student/dashboard', {
            title: 'Student Dashboard', layout: 'layouts/main',
            profile: null,
            hasHoliday: false, calendarHolidays: [], upcomingHolidays: [], holidayViewUrl: '/student/holidays',
        });
    }
};

module.exports = { getDashboard };
