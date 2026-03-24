const ClassAnnouncement = require('../models/ClassAnnouncement');
const ClassSection = require('../models/ClassSection');
const ClassMonitor = require('../models/ClassMonitor');
const StudentProfile = require('../models/StudentProfile');
const ParentProfile = require('../models/ParentProfile');
const User = require('../models/User');
const Timetable = require('../models/Timetable');
const TimetableEntry = require('../models/TimetableEntry');
const Attendance = require('../models/Attendance');
const AttendanceRecord = require('../models/AttendanceRecord');
const { sendAttendanceNotification } = require('../utils/sendEmail');

/* ─────────────────────────────────────────────
   TEACHER — MY SECTION
───────────────────────────────────────────── */

const getMySection = async (req, res) => {
    try {
        // Find sections where this teacher is class teacher or substitute
        const sections = await ClassSection.find({
            school: req.session.schoolId,
            $or: [
                { classTeacher: req.session.userId },
                { substituteTeacher: req.session.userId },
            ],
        }).populate('class', 'className classNumber').populate('academicYear', 'yearName');

        if (!sections.length) {
            return res.render('teacher/mySection', {
                title: 'My Section', layout: 'layouts/main',
                section: null, students: [], monitors: [], announcements: [],
            });
        }

        // Use first (primary) section
        const section = sections[0];
        const students = await StudentProfile.find({ currentSection: section._id, school: req.session.schoolId })
            .populate('user', 'name email phone');

        const monitors = await ClassMonitor.find({ section: section._id, status: 'active' })
            .populate('student', 'name email');
        const monitorStudentIds = monitors.map(m => m.student._id.toString());

        const announcements = await ClassAnnouncement.find({ section: section._id })
            .populate('createdBy', 'name').sort({ createdAt: -1 }).limit(10);

        res.render('teacher/mySection', {
            title: 'My Section', layout: 'layouts/main',
            section, students, monitors, monitorStudentIds, announcements,
            isClassTeacher: section.classTeacher && section.classTeacher.toString() === req.session.userId,
        });
    } catch (err) {
        req.flash('error', 'Failed to load section.'); res.redirect('/teacher/dashboard');
    }
};

/* ─────────────────────────────────────────────
   ANNOUNCEMENTS
───────────────────────────────────────────── */

const postCreateAnnouncement = async (req, res) => {
    try {
        const { sectionId, title, message } = req.body;
        // Verify teacher owns this section
        const section = await ClassSection.findOne({
            _id: sectionId, school: req.session.schoolId,
            $or: [{ classTeacher: req.session.userId }, { substituteTeacher: req.session.userId }],
        });
        if (!section) { req.flash('error', 'Not authorized for this section.'); return res.redirect('/teacher/my-section'); }

        await ClassAnnouncement.create({
            section: sectionId, title: title.trim(), message: message.trim(),
            createdBy: req.session.userId, status: 'active',
        });
        req.flash('success', 'Announcement posted.');
        res.redirect('/teacher/my-section');
    } catch (err) {
        req.flash('error', 'Failed to post announcement: ' + err.message);
        res.redirect('/teacher/my-section');
    }
};

const postDeleteAnnouncement = async (req, res) => {
    try {
        await ClassAnnouncement.findOneAndDelete({ _id: req.params.id, createdBy: req.session.userId });
        req.flash('success', 'Announcement deleted.');
        res.redirect('/teacher/my-section');
    } catch (err) {
        req.flash('error', 'Failed to delete.'); res.redirect('/teacher/my-section');
    }
};

/* ─────────────────────────────────────────────
   CLASS MONITORS
───────────────────────────────────────────── */

const postAssignMonitor = async (req, res) => {
    try {
        const { sectionId, studentId } = req.body;
        // Verify teacher owns section
        const section = await ClassSection.findOne({
            _id: sectionId, school: req.session.schoolId,
            classTeacher: req.session.userId,
        });
        if (!section) { req.flash('error', 'Only the class teacher can assign monitors.'); return res.redirect('/teacher/my-section'); }

        // Verify student belongs to this section
        const profile = await StudentProfile.findOne({ user: studentId, currentSection: sectionId });
        if (!profile) { req.flash('error', 'Student is not in this section.'); return res.redirect('/teacher/my-section'); }

        await ClassMonitor.findOneAndUpdate(
            { section: sectionId, student: studentId },
            { assignedBy: req.session.userId, assignedDate: new Date(), status: 'active' },
            { upsert: true }
        );
        req.flash('success', 'Monitor assigned.');
        res.redirect('/teacher/my-section');
    } catch (err) {
        req.flash('error', 'Failed to assign monitor: ' + err.message); res.redirect('/teacher/my-section');
    }
};

const postRemoveMonitor = async (req, res) => {
    try {
        const { sectionId, studentId } = req.body;
        const section = await ClassSection.findOne({
            _id: sectionId, school: req.session.schoolId, classTeacher: req.session.userId,
        });
        if (!section) { req.flash('error', 'Only the class teacher can remove monitors.'); return res.redirect('/teacher/my-section'); }

        await ClassMonitor.findOneAndUpdate(
            { section: sectionId, student: studentId },
            { status: 'inactive' }
        );
        req.flash('success', 'Monitor removed.');
        res.redirect('/teacher/my-section');
    } catch (err) {
        req.flash('error', 'Failed to remove monitor.'); res.redirect('/teacher/my-section');
    }
};

/* ─────────────────────────────────────────────
   ATTENDANCE
───────────────────────────────────────────── */

const getAttendance = async (req, res) => {
    try {
        const section = await ClassSection.findOne({
            school: req.session.schoolId,
            $or: [{ classTeacher: req.session.userId }, { substituteTeacher: req.session.userId }],
        }).populate('class', 'className');
        if (!section) { req.flash('error', 'No section assigned.'); return res.redirect('/teacher/dashboard'); }

        const students = await StudentProfile.find({ currentSection: section._id, school: req.session.schoolId })
            .populate('user', 'name email');

        const dateStr = req.query.date || new Date().toISOString().split('T')[0];
        const date = new Date(dateStr);

        // Check if attendance already marked
        const attendance = await Attendance.findOne({ section: section._id, date: { $gte: new Date(dateStr), $lt: new Date(new Date(dateStr).getTime() + 86400000) } });
        let records = [];
        if (attendance) {
            records = await AttendanceRecord.find({ attendance: attendance._id }).populate('student', 'name');
        }
        const recordMap = {};
        records.forEach(r => { recordMap[r.student._id.toString()] = r; });

        res.render('teacher/attendance', {
            title: 'Attendance', layout: 'layouts/main',
            section, students, date: dateStr, attendance, recordMap,
        });
    } catch (err) {
        req.flash('error', 'Failed to load attendance.'); res.redirect('/teacher/dashboard');
    }
};

const postMarkAttendance = async (req, res) => {
    try {
        const { sectionId, date, statuses } = req.body;
        // statuses = { studentId: 'Present'|'Absent'|'Late' }
        const section = await ClassSection.findOne({
            _id: sectionId, school: req.session.schoolId,
            $or: [{ classTeacher: req.session.userId }, { substituteTeacher: req.session.userId }],
        });
        if (!section) { req.flash('error', 'Not authorized.'); return res.redirect('/teacher/attendance'); }

        const attendanceDate = new Date(date);
        let attendance = await Attendance.findOne({ section: sectionId, date: { $gte: attendanceDate, $lt: new Date(attendanceDate.getTime() + 86400000) } });
        if (!attendance) {
            attendance = await Attendance.create({ section: sectionId, date: attendanceDate, createdBy: req.session.userId });
        }

        if (statuses && typeof statuses === 'object') {
            for (const [studentId, status] of Object.entries(statuses)) {
                await AttendanceRecord.findOneAndUpdate(
                    { attendance: attendance._id, student: studentId },
                    { status },
                    { upsert: true }
                );
            }

            // Fire parent notifications asynchronously (non-blocking)
            setImmediate(async () => {
                try {
                    const schoolName = req.session.schoolName || '';
                    for (const [studentId, status] of Object.entries(statuses)) {
                        const studentProfile = await StudentProfile.findOne({ user: studentId })
                            .populate('user', 'name');
                        if (!studentProfile || !studentProfile.parent) continue;
                        const parentUser = await User.findById(studentProfile.parent).select('name email');
                        if (!parentUser || !parentUser.email) continue;
                        await sendAttendanceNotification({
                            to: parentUser.email,
                            parentName: parentUser.name,
                            studentName: studentProfile.user.name,
                            date: new Date(date),
                            status,
                            schoolName,
                        });
                    }
                } catch (notifErr) {
                    console.error('Attendance notification error:', notifErr.message);
                }
            });
        }
        req.flash('success', 'Attendance saved. Parents will be notified.');
        res.redirect(`/teacher/attendance?date=${date}`);
    } catch (err) {
        req.flash('error', 'Failed to save attendance: ' + err.message);
        res.redirect('/teacher/attendance');
    }
};

/* ─────────────────────────────────────────────
   TIMETABLE (VIEW)
───────────────────────────────────────────── */

const getTeacherTimetable = async (req, res) => {
    try {
        const section = await ClassSection.findOne({
            school: req.session.schoolId,
            $or: [{ classTeacher: req.session.userId }, { substituteTeacher: req.session.userId }],
        }).populate('class', 'className');
        let timetable = null;
        let entries = [];
        if (section) {
            timetable = await Timetable.findOne({ section: section._id });
            if (timetable) {
                entries = await TimetableEntry.find({ timetable: timetable._id })
                    .populate('subject', 'subjectName').populate('teacher', 'name');
            }
        }
        // Group entries by day
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const byDay = {};
        days.forEach(d => { byDay[d] = entries.filter(e => e.dayOfWeek === d).sort((a, b) => a.periodNumber - b.periodNumber); });

        res.render('teacher/timetable', {
            title: 'My Timetable', layout: 'layouts/main',
            section, timetable, byDay, days,
        });
    } catch (err) {
        req.flash('error', 'Failed to load timetable.'); res.redirect('/teacher/dashboard');
    }
};

module.exports = {
    getMySection, postCreateAnnouncement, postDeleteAnnouncement,
    postAssignMonitor, postRemoveMonitor,
    getAttendance, postMarkAttendance,
    getTeacherTimetable,
};
