const ClassSection = require('../models/ClassSection');
const ClassAnnouncement = require('../models/ClassAnnouncement');
const StudentProfile = require('../models/StudentProfile');
const Timetable = require('../models/Timetable');
const TimetableEntry = require('../models/TimetableEntry');
const ClassMonitor = require('../models/ClassMonitor');
const AcademicYear = require('../models/AcademicYear');

// Student: view my class
const getMyClass = async (req, res) => {
    try {
        // Active academic year for the school
        const activeYear = await AcademicYear.findOne({ school: req.session.schoolId, status: 'active' }).select('yearName');

        // Find the section the student is enrolled in for the active academic year
        const section = activeYear
            ? await ClassSection.findOne({
                school: req.session.schoolId,
                academicYear: activeYear._id,
                enrolledStudents: req.session.userId,
            })
                .populate('class', 'className classNumber')
                .populate('academicYear', 'yearName')
                .populate('classTeacher', 'name email')
                .populate('substituteTeacher', 'name email')
            : null;

        if (!section) {
            return res.render('student/myClass', {
                title: 'My Class', layout: 'layouts/main',
                section: null, announcements: [], timetable: null, byDay: {}, days: [], isMonitor: false, activeYear,
            });
        }
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
            section, announcements, timetable, byDay, days, isMonitor: !!monitorEntry, activeYear,
        });
    } catch (err) {
        req.flash('error', 'Failed to load class info.'); res.redirect('/student/dashboard');
    }
};

module.exports = { getMyClass };
