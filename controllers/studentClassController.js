const ClassSection = require('../models/ClassSection');
const ClassAnnouncement = require('../models/ClassAnnouncement');
const StudentProfile = require('../models/StudentProfile');
const Timetable = require('../models/Timetable');
const TimetableEntry = require('../models/TimetableEntry');
const ClassMonitor = require('../models/ClassMonitor');

// Student: view my class
const getMyClass = async (req, res) => {
    try {
        const profile = await StudentProfile.findOne({
            user: req.session.userId, school: req.session.schoolId,
        }).populate({
            path: 'currentSection', populate: [
                { path: 'class', select: 'className classNumber' },
                { path: 'academicYear', select: 'yearName' },
                { path: 'classTeacher', select: 'name email' },
                { path: 'substituteTeacher', select: 'name email' },
            ]
        });

        if (!profile || !profile.currentSection) {
            return res.render('student/myClass', {
                title: 'My Class', layout: 'layouts/main',
                section: null, announcements: [], timetable: null, byDay: {}, days: [], isMonitor: false,
            });
        }

        const section = profile.currentSection;
        const announcements = await ClassAnnouncement.find({ section: section._id, status: 'active' })
            .populate('createdBy', 'name').sort({ createdAt: -1 });

        // Timetable
        const timetable = await Timetable.findOne({ section: section._id });
        let byDay = {}, days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        if (timetable) {
            const entries = await TimetableEntry.find({ timetable: timetable._id })
                .populate('subject', 'subjectName').populate('teacher', 'name');
            days.forEach(d => { byDay[d] = entries.filter(e => e.dayOfWeek === d).sort((a, b) => a.periodNumber - b.periodNumber); });
        }

        // Is monitor?
        const monitorEntry = await ClassMonitor.findOne({ section: section._id, student: req.session.userId, status: 'active' });

        res.render('student/myClass', {
            title: 'My Class', layout: 'layouts/main',
            section, announcements, timetable, byDay, days, isMonitor: !!monitorEntry,
        });
    } catch (err) {
        req.flash('error', 'Failed to load class info.'); res.redirect('/student/dashboard');
    }
};

module.exports = { getMyClass };
