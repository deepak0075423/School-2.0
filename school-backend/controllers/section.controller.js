'use strict';
const ClassSection        = require('../models/ClassSection');
const Attendance          = require('../models/Attendance');
const ClassAnnouncement   = require('../models/ClassAnnouncement');
const ClassMonitor        = require('../models/ClassMonitor');
const StudentProfile      = require('../models/StudentProfile');
const AttendanceRecord    = require('../models/AttendanceRecord');

const ok  = (res, d, s=200) => res.status(s).json({ success: true, data: d });
const err = (res, e, s=500) => res.status(s).json({ success: false, message: e.message||e });

exports.getMySection = async (req, res) => {
    try {
        const section = await ClassSection.findOne({ classTeacher: req.userId, school: req.schoolId })
            .populate('class').lean();
        const announcements = await ClassAnnouncement.find({ section: section?._id }).sort({ createdAt: -1 }).lean();
        const monitors = await ClassMonitor.find({ section: section?._id }).populate('student','name').lean();
        ok(res, { section, announcements, monitors });
    } catch (e) { err(res, e); }
};
exports.createAnnouncement = async (req, res) => {
    try {
        const mySection = await ClassSection.findOne({ classTeacher: req.userId, school: req.schoolId }).lean();
        const ann = await ClassAnnouncement.create({
            section: mySection?._id, createdBy: req.userId, school: req.schoolId, ...req.body,
        });
        ok(res, ann, 201);
    } catch (e) { err(res, e); }
};
exports.deleteAnnouncement = async (req, res) => {
    try {
        // Announcements have no school field — authorize via the teacher's own section
        const mySection = await ClassSection.findOne({ classTeacher: req.userId, school: req.schoolId }).lean();
        await ClassAnnouncement.findOneAndDelete({ _id: req.params.id, section: mySection?._id });
        res.json({ success: true });
    } catch (e) { err(res, e); }
};
exports.assignMonitor = async (req, res) => {
    try {
        const mySection = await ClassSection.findOne({ classTeacher: req.userId, school: req.schoolId }).lean();
        const mon = await ClassMonitor.create({
            section: mySection?._id, assignedBy: req.userId, school: req.schoolId, ...req.body,
        });
        ok(res, mon, 201);
    } catch (e) { err(res, e); }
};
exports.removeMonitor = async (req, res) => {
    try {
        const mySection = await ClassSection.findOne({ classTeacher: req.userId, school: req.schoolId }).lean();
        await ClassMonitor.findOneAndDelete({ _id: req.params.id, section: mySection?._id });
        res.json({ success: true });
    } catch (e) { err(res, e); }
};
// Attendance statuses are stored capitalized ('Present'|'Absent'|'Late') but the
// frontend works in lowercase — normalize at this boundary in both directions.
const CAP_STATUS = { present: 'Present', absent: 'Absent', late: 'Late' };
const capStatus  = (s) => CAP_STATUS[String(s || '').toLowerCase()] || 'Absent';

const teacherSection = (req) => ClassSection.findOne({
    school: req.schoolId,
    $or: [{ classTeacher: req.userId }, { substituteTeacher: req.userId }],
}).lean();

exports.getAttendance = async (req, res) => {
    try {
        const { date } = req.query;
        const mySection = await teacherSection(req);
        const students = await StudentProfile.find({ currentSection: mySection?._id })
            .populate('user','name').lean();

        let records = [];
        if (date && mySection) {
            const attendanceDate = new Date(date + 'T00:00:00.000Z');
            const session = await Attendance.findOne({ section: mySection._id, date: attendanceDate }).lean();
            if (session) {
                const recs = await AttendanceRecord.find({ attendance: session._id }).lean();
                records = recs.map(r => ({ ...r, status: String(r.status || '').toLowerCase() }));
            }
        }
        ok(res, { students, records });
    } catch (e) { err(res, e); }
};

exports.markAttendance = async (req, res) => {
    try {
        const { date, records } = req.body;
        if (!date || !Array.isArray(records)) return err(res, 'date and records are required', 400);

        const mySection = await teacherSection(req);
        if (!mySection) return err(res, 'No section assigned to you', 403);

        // Normalize to UTC midnight so the unique (section,date) index behaves
        const attendanceDate = new Date(date + 'T00:00:00.000Z');
        const session = await Attendance.findOneAndUpdate(
            { section: mySection._id, date: attendanceDate },
            { $setOnInsert: { section: mySection._id, date: attendanceDate, createdBy: req.userId } },
            { upsert: true, new: true }
        );

        const saved = await Promise.all(records.map(r =>
            AttendanceRecord.findOneAndUpdate(
                { attendance: session._id, student: r.studentId },
                { $set: { status: capStatus(r.status) } },
                { upsert: true, new: true }
            )
        ));

        // Notify parents by email (non-blocking)
        setImmediate(async () => {
            try {
                const User = require('../models/User');
                const School = require('../models/School');
                const { sendAttendanceNotification } = require('../utils/sendEmail');
                const school = await School.findById(req.schoolId).select('name').lean();
                for (const r of records) {
                    const sp = await StudentProfile.findOne({ user: r.studentId }).populate('user', 'name').lean();
                    if (!sp?.parent) continue;
                    const parentUser = await User.findById(sp.parent).select('name email').lean();
                    if (!parentUser?.email) continue;
                    await sendAttendanceNotification({
                        to: parentUser.email,
                        parentName: parentUser.name,
                        studentName: sp.user?.name || '',
                        date: new Date(date),
                        status: capStatus(r.status),
                        schoolName: school?.name || '',
                    });
                }
            } catch (e) { console.error('Attendance notification error:', e.message); }
        });

        ok(res, saved);
    } catch (e) { err(res, e); }
};
