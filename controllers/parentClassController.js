const StudentProfile = require('../models/StudentProfile');
const ParentProfile = require('../models/ParentProfile');
const ClassSection = require('../models/ClassSection');
const ClassAnnouncement = require('../models/ClassAnnouncement');
const Timetable = require('../models/Timetable');
const TimetableEntry = require('../models/TimetableEntry');

// Parent: view child's class
const getChildClass = async (req, res) => {
    try {
        const parentProfile = await ParentProfile.findOne({
            user: req.session.userId, school: req.session.schoolId,
        });

        if (!parentProfile || !parentProfile.children || !parentProfile.children.length) {
            return res.render('parent/childClass', {
                title: "Child's Class", layout: 'layouts/main',
                children: [],
            });
        }

        const children = await Promise.all(parentProfile.children.map(async (childUserId) => {
            const profile = await StudentProfile.findOne({
                user: childUserId, school: req.session.schoolId,
            }).populate('user', 'name email')
                .populate({
                    path: 'currentSection', populate: [
                        { path: 'class', select: 'className classNumber' },
                        { path: 'academicYear', select: 'yearName' },
                        { path: 'classTeacher', select: 'name email' },
                    ]
                });

            if (!profile) return null;

            let announcements = [];
            let byDay = {}, days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            if (profile.currentSection) {
                announcements = await ClassAnnouncement.find({
                    section: profile.currentSection._id, status: 'active',
                }).populate('createdBy', 'name').sort({ createdAt: -1 }).limit(5);

                const timetable = await Timetable.findOne({ section: profile.currentSection._id });
                if (timetable) {
                    const entries = await TimetableEntry.find({ timetable: timetable._id })
                        .populate('subject', 'subjectName').populate('teacher', 'name');
                    days.forEach(d => { byDay[d] = entries.filter(e => e.dayOfWeek === d).sort((a, b) => a.periodNumber - b.periodNumber); });
                }
            }
            return { profile, announcements, byDay, days };
        }));

        res.render('parent/childClass', {
            title: "Child's Class", layout: 'layouts/main',
            children: children.filter(Boolean),
        });
    } catch (err) {
        req.flash('error', 'Failed to load class info.'); res.redirect('/parent/dashboard');
    }
};

module.exports = { getChildClass };
