'use strict';
const ClassSection        = require('../models/ClassSection');
const Attendance          = require('../models/Attendance');
const ClassAnnouncement   = require('../models/ClassAnnouncement');
const ClassMonitor        = require('../models/ClassMonitor');
const TeacherProfile      = require('../models/TeacherProfile');
const StudentProfile      = require('../models/StudentProfile');
const AttendanceRecord    = require('../models/AttendanceRecord');

const ok  = (res, d, s=200) => res.status(s).json({ success: true, data: d });
const err = (res, e, s=500) => res.status(s).json({ success: false, message: e.message||e });

exports.getMySection = async (req, res) => {
    try {
        const profile = await TeacherProfile.findOne({ user: req.userId }).lean();
        const section = await ClassSection.findById(profile?.classSection)
            .populate('class').lean();
        const announcements = await ClassAnnouncement.find({ section: section?._id }).sort({ createdAt: -1 }).lean();
        const monitors = await ClassMonitor.find({ section: section?._id }).populate('student','name').lean();
        ok(res, { section, announcements, monitors });
    } catch (e) { err(res, e); }
};
exports.createAnnouncement = async (req, res) => {
    try {
        const profile = await TeacherProfile.findOne({ user: req.userId }).lean();
        const ann = await ClassAnnouncement.create({
            section: profile?.classSection, createdBy: req.userId, school: req.schoolId, ...req.body,
        });
        ok(res, ann, 201);
    } catch (e) { err(res, e); }
};
exports.deleteAnnouncement = async (req, res) => {
    try {
        await ClassAnnouncement.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (e) { err(res, e); }
};
exports.assignMonitor = async (req, res) => {
    try {
        const profile = await TeacherProfile.findOne({ user: req.userId }).lean();
        const mon = await ClassMonitor.create({
            section: profile?.classSection, assignedBy: req.userId, school: req.schoolId, ...req.body,
        });
        ok(res, mon, 201);
    } catch (e) { err(res, e); }
};
exports.removeMonitor = async (req, res) => {
    try {
        await ClassMonitor.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (e) { err(res, e); }
};
exports.getAttendance = async (req, res) => {
    try {
        const { date } = req.query;
        const profile  = await TeacherProfile.findOne({ user: req.userId }).lean();
        const students = await StudentProfile.find({ currentSection: profile?.classSection })
            .populate('user','name').lean();
        const records  = date ? await AttendanceRecord.find({
            section: profile?.classSection, date: new Date(date),
        }).lean() : [];
        ok(res, { students, records });
    } catch (e) { err(res, e); }
};
exports.markAttendance = async (req, res) => {
    try {
        const { date, records } = req.body;
        const saved = await Promise.all(records.map(r =>
            AttendanceRecord.findOneAndUpdate(
                { student: r.studentId, date: new Date(date) },
                { ...r, markedBy: req.userId, school: req.schoolId },
                { upsert: true, new: true }
            )
        ));
        ok(res, saved);
    } catch (e) { err(res, e); }
};
