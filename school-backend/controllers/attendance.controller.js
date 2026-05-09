'use strict';
const Attendance       = require('../models/Attendance');
const AttendanceRecord = require('../models/AttendanceRecord');
const TeacherAttendance = require('../models/TeacherAttendance');
const TeacherAttendanceRegularization = require('../models/TeacherAttendanceRegularization');
const AttendanceCorrection = require('../models/AttendanceCorrection');
const StudentProfile   = require('../models/StudentProfile');

const ok  = (res, d, s=200) => res.status(s).json({ success: true, data: d });
const err = (res, e, s=500) => res.status(s).json({ success: false, message: e.message||e });

exports.getAdminRegularizationRequests = async (req, res) => {
    try {
        const { page=1, limit=20, status } = req.query;
        const filter = { school: req.schoolId };
        if (status) filter.status = status;
        const [requests, total] = await Promise.all([
            TeacherAttendanceRegularization.find(filter).populate('teacher','name email').sort({createdAt:-1}).skip((page-1)*+limit).limit(+limit).lean(),
            TeacherAttendanceRegularization.countDocuments(filter),
        ]);
        res.json({ success: true, data: requests, total });
    } catch (e) { err(res, e); }
};
exports.adminReviewRegularization = async (req, res) => {
    try {
        const { id, status, remarks } = req.body;
        const reg = await TeacherAttendanceRegularization.findByIdAndUpdate(id, { status, remarks, reviewedBy: req.userId }, { new: true });
        ok(res, reg);
    } catch (e) { err(res, e); }
};
exports.getTeacherSelfAttendance = async (req, res) => {
    try {
        const { month, year } = req.query;
        const filter = { teacher: req.userId };
        if (month && year) {
            const start = new Date(year, month-1, 1);
            const end   = new Date(year, month, 0);
            filter.date = { $gte: start, $lte: end };
        }
        const records = await TeacherAttendance.find(filter).sort({ date: 1 }).lean();
        ok(res, records);
    } catch (e) { err(res, e); }
};
exports.markTeacherSelfAttendance = async (req, res) => {
    try {
        const { date, status, checkIn, checkOut } = req.body;
        const rec = await TeacherAttendance.findOneAndUpdate(
            { teacher: req.userId, date: new Date(date) },
            { status, checkIn, checkOut, school: req.schoolId },
            { upsert: true, new: true }
        );
        ok(res, rec);
    } catch (e) { err(res, e); }
};
exports.getRegularizationForm = async (req, res) => {
    ok(res, { message: 'Regularization form data' });
};
exports.submitRegularization = async (req, res) => {
    try {
        const reg = await TeacherAttendanceRegularization.create({
            teacher: req.userId, school: req.schoolId, ...req.body,
        });
        ok(res, reg, 201);
    } catch (e) { err(res, e); }
};
exports.getAttendanceDashboard = async (req, res) => {
    ok(res, { message: 'Attendance dashboard data' });
};
exports.getStudentProfile = async (req, res) => {
    try {
        const profile = await StudentProfile.findOne({ user: req.params.studentId }).lean();
        const records = await AttendanceRecord.find({ student: req.params.studentId }).sort({date:-1}).limit(30).lean();
        ok(res, { profile, records });
    } catch (e) { err(res, e); }
};
exports.getCorrectionRequests = async (req, res) => {
    try {
        const requests = await AttendanceCorrection.find({ school: req.schoolId, status: 'pending' })
            .populate('student','name').lean();
        ok(res, requests);
    } catch (e) { err(res, e); }
};
exports.reviewCorrection = async (req, res) => {
    try {
        const { id, status } = req.body;
        const corr = await AttendanceCorrection.findByIdAndUpdate(id, { status, reviewedBy: req.userId }, { new: true });
        ok(res, corr);
    } catch (e) { err(res, e); }
};
exports.getStudentAttendanceCalendar = async (req, res) => {
    try {
        const { month, year } = req.query;
        const filter = { student: req.userId };
        if (month && year) {
            filter.date = { $gte: new Date(year, month-1, 1), $lte: new Date(year, month, 0) };
        }
        const records = await AttendanceRecord.find(filter).sort({ date: 1 }).lean();
        ok(res, records);
    } catch (e) { err(res, e); }
};
exports.getStudentCorrectionForm = async (req, res) => { ok(res, {}); };
exports.submitStudentCorrection = async (req, res) => {
    try {
        const corr = await AttendanceCorrection.create({ student: req.userId, school: req.schoolId, ...req.body });
        ok(res, corr, 201);
    } catch (e) { err(res, e); }
};
exports.getParentChildAttendance = async (req, res) => {
    try {
        const ParentProfile = require('../models/ParentProfile');
        const parent = await ParentProfile.findOne({ user: req.userId }).lean();
        const childId = parent?.student;
        const records = await AttendanceRecord.find({ student: childId }).sort({ date: -1 }).limit(60).lean();
        ok(res, records);
    } catch (e) { err(res, e); }
};
