const ParentProfile = require('../models/ParentProfile');
const StudentProfile = require('../models/StudentProfile');

const getDashboard = async (req, res) => {
    try {
        const profile = await ParentProfile.findOne({ user: req.session.userId })
            .populate({ path: 'children', populate: { path: 'school' } });
        const childProfiles = profile ? await StudentProfile.find({ parent: req.session.userId }).populate('user') : [];

        res.render('parent/dashboard', {
            title: 'Parent Dashboard',
            layout: 'layouts/main',
            profile,
            childProfiles,
        });
    } catch (err) {
        console.error(err);
        res.render('parent/dashboard', { title: 'Parent Dashboard', layout: 'layouts/main', profile: null, childProfiles: [] });
    }
};

module.exports = { getDashboard };
