const ClassSection = require('../models/ClassSection');
const StudentProfile = require('../models/StudentProfile');
const ParentProfile = require('../models/ParentProfile');
const TeacherProfile = require('../models/TeacherProfile');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const AttendanceRecord = require('../models/AttendanceRecord');
const AttendanceCorrection = require('../models/AttendanceCorrection');
const TeacherAttendance = require('../models/TeacherAttendance');
const TeacherAttendanceRegularization = require('../models/TeacherAttendanceRegularization');

/* ─────────────────────────────────────────────
   HELPERS
─────────────────────────────────────────────── */

/**
 * Resolve the date range for a given YYYY-MM-DD string.
 * Returns { start, end } covering the full calendar day.
 */
function dayRange(dateStr) {
    const start = new Date(dateStr);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dateStr);
    end.setHours(23, 59, 59, 999);
    return { start, end };
}

/**
 * Build a calendar-ready map { 'YYYY-MM-DD': status } from AttendanceRecords.
 */
async function buildStudentCalendarMap(studentUserId, schoolId, fromDate, toDate) {
    // Find all attendance sessions in date range for sections the student belongs to
    const profile = await StudentProfile.findOne({ user: studentUserId, school: schoolId });
    if (!profile || !profile.currentSection) return {};

    const sessions = await Attendance.find({
        section: profile.currentSection,
        date: { $gte: fromDate, $lte: toDate },
    });
    const sessionIds = sessions.map(s => s._id);
    const sessionDateMap = {};
    sessions.forEach(s => { sessionDateMap[s._id.toString()] = s.date; });

    const records = await AttendanceRecord.find({
        attendance: { $in: sessionIds },
        student: studentUserId,
    });

    const calMap = {};
    records.forEach(r => {
        const d = sessionDateMap[r.attendance.toString()];
        if (d) {
            const key = new Date(d).toISOString().split('T')[0];
            calMap[key] = r.status;
        }
    });
    return calMap;
}

/**
 * Compute attendance stats for a student over a date range.
 */
async function computeStudentStats(studentUserId, sectionId) {
    const sessions = await Attendance.find({ section: sectionId });
    const sessionIds = sessions.map(s => s._id);
    const records = await AttendanceRecord.find({
        attendance: { $in: sessionIds },
        student: studentUserId,
    });
    const total = records.length;
    const present = records.filter(r => r.status === 'Present').length;
    const absent = records.filter(r => r.status === 'Absent').length;
    const late = records.filter(r => r.status === 'Late').length;
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
    return { total, present, absent, late, percentage };
}

/* ─────────────────────────────────────────────
   TEACHER — SELF ATTENDANCE
─────────────────────────────────────────────── */

const getTeacherSelfAttendance = async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const { start, end } = dayRange(today);

        const todayRecord = await TeacherAttendance.findOne({
            teacher: req.session.userId,
            school: req.session.schoolId,
            date: { $gte: start, $lte: end },
        });

        // Build calendar data for current month
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const monthRecords = await TeacherAttendance.find({
            teacher: req.session.userId,
            school: req.session.schoolId,
            date: { $gte: monthStart, $lte: monthEnd },
        });

        const calendarMap = {};
        monthRecords.forEach(r => {
            const key = new Date(r.date).toISOString().split('T')[0];
            calendarMap[key] = r.status;
        });

        // Monthly stats
        const present = monthRecords.filter(r => r.status === 'Present').length;
        const absent = monthRecords.filter(r => r.status === 'Absent').length;
        const halfDay = monthRecords.filter(r => r.status === 'Half-Day').length;
        const leave = monthRecords.filter(r => r.status === 'Leave').length;

        // Pending regularizations
        const pendingCount = await TeacherAttendanceRegularization.countDocuments({
            teacher: req.session.userId,
            status: 'Pending',
        });

        res.render('teacher/teacher-attendance', {
            title: 'My Attendance', layout: 'layouts/main',
            today, todayRecord, calendarMap: JSON.stringify(calendarMap),
            monthYear: `${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()}`,
            stats: { present, absent, halfDay, leave, total: monthRecords.length },
            pendingCount,
        });
    } catch (err) {
        req.flash('error', 'Failed to load attendance: ' + err.message);
        res.redirect('/teacher/dashboard');
    }
};

const postMarkTeacherSelfAttendance = async (req, res) => {
    try {
        const { date, status, remarks } = req.body;
        const { start, end } = dayRange(date);

        // Prevent future-date marking
        if (new Date(date) > new Date()) {
            req.flash('error', 'Cannot mark attendance for a future date.');
            return res.redirect('/teacher/my-attendance');
        }

        await TeacherAttendance.findOneAndUpdate(
            { teacher: req.session.userId, school: req.session.schoolId, date: { $gte: start, $lte: end } },
            {
                teacher: req.session.userId,
                school: req.session.schoolId,
                date: new Date(date),
                status, remarks: remarks || '',
                markedBy: req.session.userId,
            },
            { upsert: true, new: true }
        );

        req.flash('success', `Attendance marked as ${status} for ${date}.`);
        res.redirect('/teacher/my-attendance');
    } catch (err) {
        req.flash('error', 'Failed to mark attendance: ' + err.message);
        res.redirect('/teacher/my-attendance');
    }
};

/* ─────────────────────────────────────────────
   TEACHER — REGULARIZATION REQUESTS
─────────────────────────────────────────────── */

const getRegularizationForm = async (req, res) => {
    try {
        const myRequests = await TeacherAttendanceRegularization.find({
            teacher: req.session.userId,
        }).sort({ createdAt: -1 }).limit(20);

        res.render('teacher/regularization-request', {
            title: 'Regularization Request', layout: 'layouts/main',
            myRequests,
            today: new Date().toISOString().split('T')[0],
        });
    } catch (err) {
        req.flash('error', 'Failed to load form.'); res.redirect('/teacher/my-attendance');
    }
};

const postSubmitRegularization = async (req, res) => {
    try {
        const { date, requestType, requestedStatus, reason } = req.body;

        // Check no existing pending request for same date
        const existing = await TeacherAttendanceRegularization.findOne({
            teacher: req.session.userId,
            date: { $gte: new Date(date), $lte: new Date(new Date(date).getTime() + 86399999) },
            status: 'Pending',
        });
        if (existing) {
            req.flash('error', 'A pending regularization request already exists for this date.');
            return res.redirect('/teacher/regularization');
        }

        await TeacherAttendanceRegularization.create({
            teacher: req.session.userId,
            school: req.session.schoolId,
            date: new Date(date),
            requestType, requestedStatus, reason: reason.trim(),
            status: 'Pending',
        });

        req.flash('success', 'Regularization request submitted. Awaiting admin approval.');
        res.redirect('/teacher/regularization');
    } catch (err) {
        req.flash('error', 'Failed to submit request: ' + err.message);
        res.redirect('/teacher/regularization');
    }
};

/* ─────────────────────────────────────────────
   TEACHER — ATTENDANCE DASHBOARD (CLASS)
─────────────────────────────────────────────── */

const getAttendanceDashboard = async (req, res) => {
    try {
        const section = await ClassSection.findOne({
            school: req.session.schoolId,
            $or: [
                { classTeacher: req.session.userId },
                { substituteTeacher: req.session.userId },
            ],
        }).populate('class', 'className classNumber');

        if (!section) {
            req.flash('error', 'No section assigned.');
            return res.redirect('/teacher/dashboard');
        }

        const students = await StudentProfile.find({
            currentSection: section._id,
            school: req.session.schoolId,
        }).populate('user', 'name email profileImage');

        // Compute stats for each student
        const sessions = await Attendance.find({ section: section._id });
        const sessionIds = sessions.map(s => s._id);
        const totalSessions = sessions.length;

        const allRecords = await AttendanceRecord.find({ attendance: { $in: sessionIds } });

        // Build per-student stats
        const statsMap = {};
        students.forEach(sp => {
            const uid = sp.user._id.toString();
            const recs = allRecords.filter(r => r.student.toString() === uid);
            const present = recs.filter(r => r.status === 'Present').length;
            const absent = recs.filter(r => r.status === 'Absent').length;
            const late = recs.filter(r => r.status === 'Late').length;
            const marked = recs.length;
            const pct = marked > 0 ? Math.round((present / marked) * 100) : 0;
            statsMap[uid] = { present, absent, late, marked, percentage: pct };
        });

        // Sort students by attendance percentage for ranking
        const rankedStudents = [...students].sort((a, b) => {
            const pA = statsMap[a.user._id.toString()]?.percentage || 0;
            const pB = statsMap[b.user._id.toString()]?.percentage || 0;
            return pB - pA;
        });

        // Last 7 days trend
        const today = new Date();
        const trendDays = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            const key = d.toISOString().split('T')[0];
            const session = sessions.find(s => new Date(s.date).toISOString().split('T')[0] === key);
            let presentCount = 0;
            if (session) {
                presentCount = allRecords.filter(r =>
                    r.attendance.toString() === session._id.toString() && r.status === 'Present'
                ).length;
            }
            trendDays.push({ date: key, label: d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }), present: presentCount, total: students.length });
        }

        // Pending correction requests for this section
        const pendingCorrections = await AttendanceCorrection.countDocuments({
            section: section._id, status: 'Pending',
        });

        res.render('teacher/attendance-dashboard', {
            title: 'Attendance Dashboard', layout: 'layouts/main',
            section, rankedStudents, statsMap, totalSessions,
            trendData: JSON.stringify(trendDays), pendingCorrections,
        });
    } catch (err) {
        req.flash('error', 'Failed to load dashboard: ' + err.message);
        res.redirect('/teacher/dashboard');
    }
};

/* ─────────────────────────────────────────────
   TEACHER — VIEW STUDENT PROFILE + ATTENDANCE
─────────────────────────────────────────────── */

const getStudentProfile = async (req, res) => {
    try {
        const { studentId } = req.params;

        // Verify teacher has access to this student's section
        const teacherSection = await ClassSection.findOne({
            school: req.session.schoolId,
            $or: [
                { classTeacher: req.session.userId },
                { substituteTeacher: req.session.userId },
            ],
        }).populate('class', 'className classNumber');

        if (!teacherSection) {
            req.flash('error', 'No section assigned.');
            return res.redirect('/teacher/dashboard');
        }

        const profile = await StudentProfile.findOne({
            user: studentId,
            currentSection: teacherSection._id,
            school: req.session.schoolId,
        }).populate('user', 'name email phone profileImage')
          .populate('currentSection')
          .populate('parent', 'name email');

        if (!profile) {
            req.flash('error', 'Student not found in your section.');
            return res.redirect('/teacher/attendance-dashboard');
        }

        // Full attendance history
        const sessions = await Attendance.find({ section: teacherSection._id }).sort({ date: -1 });
        const sessionIds = sessions.map(s => s._id);
        const records = await AttendanceRecord.find({
            attendance: { $in: sessionIds },
            student: studentId,
        });

        const sessionDateMap = {};
        sessions.forEach(s => { sessionDateMap[s._id.toString()] = s.date; });

        const history = records.map(r => ({
            date: sessionDateMap[r.attendance.toString()],
            status: r.status,
            remarks: r.remarks,
        })).sort((a, b) => new Date(b.date) - new Date(a.date));

        // Stats
        const total = records.length;
        const present = records.filter(r => r.status === 'Present').length;
        const absent = records.filter(r => r.status === 'Absent').length;
        const late = records.filter(r => r.status === 'Late').length;
        const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

        // Calendar map for current month
        const now = new Date();
        const calMap = {};
        history.forEach(h => {
            if (h.date) {
                const key = new Date(h.date).toISOString().split('T')[0];
                calMap[key] = h.status;
            }
        });

        res.render('teacher/student-profile', {
            title: `${profile.user.name} — Profile`, layout: 'layouts/main',
            profile, teacherSection,
            stats: { total, present, absent, late, percentage },
            history: history.slice(0, 30),
            calendarMap: JSON.stringify(calMap),
        });
    } catch (err) {
        req.flash('error', 'Failed to load student profile: ' + err.message);
        res.redirect('/teacher/attendance-dashboard');
    }
};

/* ─────────────────────────────────────────────
   TEACHER — STUDENT CORRECTION REQUESTS
─────────────────────────────────────────────── */

const getCorrectionRequests = async (req, res) => {
    try {
        const section = await ClassSection.findOne({
            school: req.session.schoolId,
            $or: [
                { classTeacher: req.session.userId },
                { substituteTeacher: req.session.userId },
            ],
        }).populate('class', 'className');

        if (!section) {
            req.flash('error', 'No section assigned.');
            return res.redirect('/teacher/dashboard');
        }

        const filter = req.query.status || 'Pending';
        const requests = await AttendanceCorrection.find({
            section: section._id,
            ...(filter !== 'All' ? { status: filter } : {}),
        }).populate('student', 'name email')
          .sort({ createdAt: -1 });

        const pendingCount = await AttendanceCorrection.countDocuments({ section: section._id, status: 'Pending' });

        res.render('teacher/correction-requests', {
            title: 'Correction Requests', layout: 'layouts/main',
            section, requests, filter, pendingCount,
        });
    } catch (err) {
        req.flash('error', 'Failed to load correction requests: ' + err.message);
        res.redirect('/teacher/attendance-dashboard');
    }
};

const postReviewCorrection = async (req, res) => {
    try {
        const { correctionId, action, teacherRemarks } = req.body;

        const section = await ClassSection.findOne({
            school: req.session.schoolId,
            $or: [
                { classTeacher: req.session.userId },
                { substituteTeacher: req.session.userId },
            ],
        });
        if (!section) {
            req.flash('error', 'Not authorized.');
            return res.redirect('/teacher/correction-requests');
        }

        const correction = await AttendanceCorrection.findOne({
            _id: correctionId, section: section._id, status: 'Pending',
        });
        if (!correction) {
            req.flash('error', 'Request not found or already reviewed.');
            return res.redirect('/teacher/correction-requests');
        }

        const newStatus = action === 'approve' ? 'Approved' : 'Rejected';
        correction.status = newStatus;
        correction.reviewedBy = req.session.userId;
        correction.reviewedAt = new Date();
        correction.teacherRemarks = teacherRemarks || '';
        await correction.save();

        // If approved, update the actual attendance record
        if (newStatus === 'Approved') {
            if (correction.attendanceRecord) {
                await AttendanceRecord.findByIdAndUpdate(correction.attendanceRecord, {
                    status: correction.requestedStatus,
                    remarks: `Corrected via student request. ${teacherRemarks || ''}`.trim(),
                });
            } else {
                // Record was missing — create it
                await AttendanceRecord.findOneAndUpdate(
                    { attendance: correction.attendance, student: correction.student },
                    { status: correction.requestedStatus, remarks: `Added via correction request.` },
                    { upsert: true }
                );
            }
        }

        req.flash('success', `Request ${newStatus.toLowerCase()}.`);
        res.redirect('/teacher/correction-requests');
    } catch (err) {
        req.flash('error', 'Failed to review request: ' + err.message);
        res.redirect('/teacher/correction-requests');
    }
};

/* ─────────────────────────────────────────────
   ADMIN — REGULARIZATION REQUESTS
─────────────────────────────────────────────── */

const getAdminRegularizationRequests = async (req, res) => {
    try {
        const filter = req.query.status || 'Pending';
        const requests = await TeacherAttendanceRegularization.find({
            school: req.session.schoolId,
            ...(filter !== 'All' ? { status: filter } : {}),
        }).populate('teacher', 'name email')
          .populate('reviewedBy', 'name')
          .sort({ createdAt: -1 });

        const pendingCount = await TeacherAttendanceRegularization.countDocuments({
            school: req.session.schoolId, status: 'Pending',
        });

        res.render('admin/regularization-requests', {
            title: 'Regularization Requests', layout: 'layouts/main',
            requests, filter, pendingCount,
        });
    } catch (err) {
        req.flash('error', 'Failed to load requests: ' + err.message);
        res.redirect('/admin/dashboard');
    }
};

const postAdminReviewRegularization = async (req, res) => {
    try {
        const { requestId, action, adminRemarks } = req.body;

        const request = await TeacherAttendanceRegularization.findOne({
            _id: requestId, school: req.session.schoolId, status: 'Pending',
        });
        if (!request) {
            req.flash('error', 'Request not found or already reviewed.');
            return res.redirect('/admin/regularization-requests');
        }

        const newStatus = action === 'approve' ? 'Approved' : 'Rejected';
        request.status = newStatus;
        request.reviewedBy = req.session.userId;
        request.reviewedAt = new Date();
        request.adminRemarks = adminRemarks || '';
        await request.save();

        // If approved, upsert the teacher attendance record
        if (newStatus === 'Approved') {
            const { start, end } = dayRange(new Date(request.date).toISOString().split('T')[0]);
            await TeacherAttendance.findOneAndUpdate(
                { teacher: request.teacher, school: request.school, date: { $gte: start, $lte: end } },
                {
                    teacher: request.teacher, school: request.school,
                    date: request.date,
                    status: request.requestedStatus,
                    remarks: `Regularized: ${request.requestType}. ${adminRemarks || ''}`.trim(),
                    markedBy: req.session.userId,
                },
                { upsert: true }
            );
        }

        req.flash('success', `Request ${newStatus.toLowerCase()}.`);
        res.redirect('/admin/regularization-requests');
    } catch (err) {
        req.flash('error', 'Failed to review: ' + err.message);
        res.redirect('/admin/regularization-requests');
    }
};

/* ─────────────────────────────────────────────
   STUDENT — ATTENDANCE CALENDAR
─────────────────────────────────────────────── */

const getStudentAttendanceCalendar = async (req, res) => {
    try {
        const profile = await StudentProfile.findOne({
            user: req.session.userId,
            school: req.session.schoolId,
        }).populate('currentSection');

        if (!profile || !profile.currentSection) {
            req.flash('error', 'You are not assigned to a section yet.');
            return res.redirect('/student/dashboard');
        }

        // Full attendance records
        const sessions = await Attendance.find({ section: profile.currentSection._id });
        const sessionIds = sessions.map(s => s._id);
        const records = await AttendanceRecord.find({
            attendance: { $in: sessionIds },
            student: req.session.userId,
        });

        const sessionDateMap = {};
        sessions.forEach(s => { sessionDateMap[s._id.toString()] = s.date; });

        const calendarMap = {};
        records.forEach(r => {
            const d = sessionDateMap[r.attendance.toString()];
            if (d) calendarMap[new Date(d).toISOString().split('T')[0]] = r.status;
        });

        // Stats
        const total = records.length;
        const present = records.filter(r => r.status === 'Present').length;
        const absent = records.filter(r => r.status === 'Absent').length;
        const late = records.filter(r => r.status === 'Late').length;
        const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

        // Class ranking
        const students = await StudentProfile.find({
            currentSection: profile.currentSection._id,
            school: req.session.schoolId,
        });
        const allStudentIds = students.map(s => s.user);
        const allRecords = await AttendanceRecord.find({ attendance: { $in: sessionIds } });

        const classPcts = allStudentIds.map(uid => {
            const recs = allRecords.filter(r => r.student.toString() === uid.toString());
            const p = recs.filter(r => r.status === 'Present').length;
            return p > 0 ? Math.round((p / recs.length) * 100) : 0;
        }).sort((a, b) => b - a);

        const myRank = classPcts.findIndex(p => p <= percentage) + 1;

        // My pending corrections
        const pendingCorrections = await AttendanceCorrection.countDocuments({
            student: req.session.userId, status: 'Pending',
        });

        res.render('student/attendance-calendar', {
            title: 'My Attendance', layout: 'layouts/main',
            calendarMap: JSON.stringify(calendarMap),
            stats: { total, present, absent, late, percentage },
            rank: myRank || students.length,
            totalStudents: students.length,
            pendingCorrections,
        });
    } catch (err) {
        req.flash('error', 'Failed to load attendance: ' + err.message);
        res.redirect('/student/dashboard');
    }
};

/* ─────────────────────────────────────────────
   STUDENT — CORRECTION REQUEST
─────────────────────────────────────────────── */

const getStudentCorrectionForm = async (req, res) => {
    try {
        const profile = await StudentProfile.findOne({
            user: req.session.userId,
            school: req.session.schoolId,
        });

        if (!profile || !profile.currentSection) {
            req.flash('error', 'Not assigned to a section.');
            return res.redirect('/student/dashboard');
        }

        // Last 30 days attendance for dropdown
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const sessions = await Attendance.find({
            section: profile.currentSection,
            date: { $gte: thirtyDaysAgo },
        }).sort({ date: -1 });

        const sessionIds = sessions.map(s => s._id);
        const records = await AttendanceRecord.find({
            attendance: { $in: sessionIds },
            student: req.session.userId,
        });

        const sessionDateMap = {};
        sessions.forEach(s => { sessionDateMap[s._id.toString()] = s; });
        const recordSessionMap = {};
        records.forEach(r => { recordSessionMap[r.attendance.toString()] = r; });

        const attendanceDays = sessions.map(session => {
            const record = recordSessionMap[session._id.toString()];
            return {
                sessionId: session._id,
                date: session.date,
                dateStr: new Date(session.date).toISOString().split('T')[0],
                currentStatus: record ? record.status : 'Not Marked',
                recordId: record ? record._id : null,
            };
        });

        // My requests history
        const myRequests = await AttendanceCorrection.find({
            student: req.session.userId,
        }).sort({ createdAt: -1 }).limit(20);

        res.render('student/correction-request', {
            title: 'Request Attendance Correction', layout: 'layouts/main',
            attendanceDays, myRequests,
        });
    } catch (err) {
        req.flash('error', 'Failed to load form: ' + err.message);
        res.redirect('/student/my-attendance');
    }
};

const postSubmitStudentCorrection = async (req, res) => {
    try {
        const { sessionId, recordId, currentStatus, requestedStatus, reason } = req.body;

        const profile = await StudentProfile.findOne({
            user: req.session.userId,
            school: req.session.schoolId,
        });
        if (!profile) { req.flash('error', 'Profile not found.'); return res.redirect('/student/dashboard'); }

        const session = await Attendance.findById(sessionId);
        if (!session) { req.flash('error', 'Session not found.'); return res.redirect('/student/correction'); }

        // Check no existing pending correction for this date
        const dateStr = new Date(session.date).toISOString().split('T')[0];
        const existing = await AttendanceCorrection.findOne({
            student: req.session.userId,
            date: { $gte: new Date(dateStr), $lte: new Date(new Date(dateStr).getTime() + 86399999) },
            status: 'Pending',
        });
        if (existing) {
            req.flash('error', 'A pending correction request already exists for this date.');
            return res.redirect('/student/correction');
        }

        await AttendanceCorrection.create({
            student: req.session.userId,
            school: req.session.schoolId,
            section: session.section,
            attendance: sessionId,
            attendanceRecord: recordId || null,
            date: session.date,
            currentStatus: currentStatus || 'Not Marked',
            requestedStatus,
            reason: reason.trim(),
            status: 'Pending',
        });

        req.flash('success', 'Correction request submitted. Awaiting class teacher approval.');
        res.redirect('/student/correction');
    } catch (err) {
        req.flash('error', 'Failed to submit request: ' + err.message);
        res.redirect('/student/correction');
    }
};

/* ─────────────────────────────────────────────
   PARENT — CHILD ATTENDANCE CALENDAR
─────────────────────────────────────────────── */

const getParentChildAttendance = async (req, res) => {
    try {
        const parentProfile = await ParentProfile.findOne({
            user: req.session.userId,
            school: req.session.schoolId,
        }).populate('children', 'name email profileImage');

        if (!parentProfile) {
            req.flash('error', 'Parent profile not found.');
            return res.redirect('/parent/dashboard');
        }

        // Support multiple children — allow ?child=userId query
        const children = parentProfile.children || [];
        const selectedChildId = req.query.child || (children[0] ? children[0]._id.toString() : null);

        if (!selectedChildId) {
            return res.render('parent/child-attendance', {
                title: "Child's Attendance", layout: 'layouts/main',
                children: [], selectedChild: null, calendarMap: '{}',
                stats: null, pendingCorrections: 0,
            });
        }

        const selectedChild = children.find(c => c._id.toString() === selectedChildId);
        if (!selectedChild) {
            req.flash('error', 'Child not found.');
            return res.redirect('/parent/dashboard');
        }

        const childProfile = await StudentProfile.findOne({
            user: selectedChildId,
            school: req.session.schoolId,
        }).populate('currentSection');

        if (!childProfile || !childProfile.currentSection) {
            return res.render('parent/child-attendance', {
                title: "Child's Attendance", layout: 'layouts/main',
                children, selectedChild, calendarMap: '{}',
                stats: null, pendingCorrections: 0,
            });
        }

        const sessions = await Attendance.find({ section: childProfile.currentSection._id });
        const sessionIds = sessions.map(s => s._id);
        const records = await AttendanceRecord.find({
            attendance: { $in: sessionIds },
            student: selectedChildId,
        });

        const sessionDateMap = {};
        sessions.forEach(s => { sessionDateMap[s._id.toString()] = s.date; });

        const calendarMap = {};
        records.forEach(r => {
            const d = sessionDateMap[r.attendance.toString()];
            if (d) calendarMap[new Date(d).toISOString().split('T')[0]] = r.status;
        });

        const total = records.length;
        const present = records.filter(r => r.status === 'Present').length;
        const absent = records.filter(r => r.status === 'Absent').length;
        const late = records.filter(r => r.status === 'Late').length;
        const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

        const pendingCorrections = await AttendanceCorrection.countDocuments({
            student: selectedChildId, status: 'Pending',
        });

        res.render('parent/child-attendance', {
            title: "Child's Attendance", layout: 'layouts/main',
            children, selectedChild,
            calendarMap: JSON.stringify(calendarMap),
            stats: { total, present, absent, late, percentage },
            pendingCorrections,
        });
    } catch (err) {
        req.flash('error', 'Failed to load attendance: ' + err.message);
        res.redirect('/parent/dashboard');
    }
};

module.exports = {
    // Teacher — self attendance
    getTeacherSelfAttendance,
    postMarkTeacherSelfAttendance,
    // Teacher — regularization
    getRegularizationForm,
    postSubmitRegularization,
    // Teacher — class dashboard
    getAttendanceDashboard,
    getStudentProfile,
    // Teacher — correction approvals
    getCorrectionRequests,
    postReviewCorrection,
    // Admin
    getAdminRegularizationRequests,
    postAdminReviewRegularization,
    // Student
    getStudentAttendanceCalendar,
    getStudentCorrectionForm,
    postSubmitStudentCorrection,
    // Parent
    getParentChildAttendance,
};
