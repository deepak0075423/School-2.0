const User = require('../models/User');
const TeacherProfile = require('../models/TeacherProfile');
const StudentProfile = require('../models/StudentProfile');

const getDashboard = async (req, res) => {
    try {
        const profile = await TeacherProfile.findOne({ user: req.session.userId });
        const studentsInClasses = profile ? await StudentProfile.find({
            school: req.session.schoolId,
            class: { $in: profile.classes },
        }).populate('user') : [];

        res.render('teacher/dashboard', {
            title: 'Teacher Dashboard',
            layout: 'layouts/main',
            profile,
            students: studentsInClasses,
        });
    } catch (err) {
        console.error(err);
        res.render('teacher/dashboard', { title: 'Teacher Dashboard', layout: 'layouts/main', profile: null, students: [] });
    }
};

module.exports = { getDashboard };
