const StudentProfile = require('../models/StudentProfile');

const getDashboard = async (req, res) => {
    try {
        const profile = await StudentProfile.findOne({ user: req.session.userId })
            .populate('parent').populate('school');
        res.render('student/dashboard', {
            title: 'Student Dashboard',
            layout: 'layouts/main',
            profile,
        });
    } catch (err) {
        console.error(err);
        res.render('student/dashboard', { title: 'Student Dashboard', layout: 'layouts/main', profile: null });
    }
};

module.exports = { getDashboard };
