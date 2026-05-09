'use strict';
const Timetable      = require('../models/Timetable');
const TimetableEntry = require('../models/TimetableEntry');

const ok  = (res, d, s=200) => res.status(s).json({ success: true, data: d });
const err = (res, e, s=500) => res.status(s).json({ success: false, message: e.message||e });

exports.adminManageTimetable = async (req, res) => {
    try {
        const tt = await Timetable.findOne({ section: req.params.sectionId }).lean();
        ok(res, tt);
    } catch (e) { err(res, e); }
};
exports.adminSaveTimetableStructure = async (req, res) => {
    try {
        const tt = await Timetable.findOneAndUpdate(
            { section: req.params.sectionId },
            { ...req.body, section: req.params.sectionId, school: req.schoolId },
            { upsert: true, new: true }
        );
        ok(res, tt);
    } catch (e) { err(res, e); }
};
exports.adminAssignPeriods = async (req, res) => {
    try {
        const entries = await TimetableEntry.find({ section: req.params.sectionId })
            .populate('subject teacher').lean();
        ok(res, entries);
    } catch (e) { err(res, e); }
};
exports.adminSaveEntries = async (req, res) => {
    res.json({ success: true, message: 'Timetable entries saved' });
};
exports.adminDownloadSectionTimetable = (req, res) => {
    res.json({ success: true, message: 'Download endpoint — implement PDF generation' });
};
exports.adminDownloadAllTimetables = (req, res) => {
    res.json({ success: true, message: 'Download endpoint — implement PDF generation' });
};
exports.getTeachersBySubject = async (req, res) => {
    try {
        const SectionSubjectTeacher = require('../models/SectionSubjectTeacher');
        const { subjectId } = req.query;
        const records = await SectionSubjectTeacher.find({ subject: subjectId, school: req.schoolId })
            .populate('teacher', 'name email').lean();
        const teachers = [...new Map(records.map(r => [String(r.teacher._id), r.teacher])).values()];
        ok(res, teachers);
    } catch (e) { err(res, e); }
};
exports.teacherViewTimetable = async (req, res) => {
    try {
        const entries = await TimetableEntry.find({ teacher: req.userId, school: req.schoolId })
            .populate('subject section').lean();
        ok(res, entries);
    } catch (e) { err(res, e); }
};
exports.teacherDownloadTimetable = (req, res) => {
    res.json({ success: true, message: 'Download — implement PDF' });
};
exports.studentViewTimetable = async (req, res) => {
    try {
        const StudentProfile = require('../models/StudentProfile');
        const profile = await StudentProfile.findOne({ user: req.userId }).lean();
        const entries = await TimetableEntry.find({ section: profile?.currentSection, school: req.schoolId })
            .populate('subject teacher').lean();
        ok(res, entries);
    } catch (e) { err(res, e); }
};
exports.studentDownloadTimetable = (req, res) => {
    res.json({ success: true, message: 'Download — implement PDF' });
};
