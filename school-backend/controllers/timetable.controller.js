'use strict';
const Timetable      = require('../models/Timetable');
const TimetableEntry = require('../models/TimetableEntry');

const ok  = (res, d, s=200) => res.status(s).json({ success: true, data: d });
const err = (res, e, s=500) => res.status(s).json({ success: false, message: e.message||e });

const getActiveYearId = async (schoolId) => {
    const AcademicYear = require('../models/AcademicYear');
    const y = await AcademicYear.findOne({ school: schoolId, status: 'active' }).select('_id').lean();
    return y?._id;
};

exports.adminManageTimetable = async (req, res) => {
    try {
        const yearId = await getActiveYearId(req.schoolId);
        const tt = await Timetable.findOne({ section: req.params.sectionId, academicYear: yearId }).lean()
                || await Timetable.findOne({ section: req.params.sectionId }).lean();
        ok(res, tt);
    } catch (e) { err(res, e); }
};

exports.adminSaveTimetableStructure = async (req, res) => {
    try {
        const AcademicYear = require('../models/AcademicYear');
        const activeYear = await AcademicYear.findOne({ school: req.schoolId, status: 'active' }).lean();
        const tt = await Timetable.findOneAndUpdate(
            { section: req.params.sectionId },
            {
                $set: {
                    schoolStartTime:  req.body.schoolStartTime,
                    schoolEndTime:    req.body.schoolEndTime,
                    periodsStructure: req.body.periods || req.body.periodsStructure || [],
                },
                $setOnInsert: {
                    section:      req.params.sectionId,
                    academicYear: activeYear?._id,
                    createdBy:    req.userId,
                },
            },
            { upsert: true, new: true }
        );
        ok(res, tt);
    } catch (e) { err(res, e); }
};

exports.adminAssignPeriods = async (req, res) => {
    try {
        const yearId = await getActiveYearId(req.schoolId);
        const tt = await Timetable.findOne({ section: req.params.sectionId, academicYear: yearId }).lean()
                || await Timetable.findOne({ section: req.params.sectionId }).lean();
        if (!tt) return ok(res, []);
        const entries = await TimetableEntry.find({ timetable: tt._id })
            .populate('subject teacher').lean();
        ok(res, entries);
    } catch (e) { err(res, e); }
};

exports.adminSaveEntries = async (req, res) => {
    try {
        const { sectionId } = req.params;
        let tt = await Timetable.findOne({ section: sectionId });
        if (!tt) {
            const AcademicYear = require('../models/AcademicYear');
            const activeYear = await AcademicYear.findOne({ school: req.schoolId, status: 'active' }).lean();
            tt = await Timetable.create({
                section: sectionId,
                academicYear: activeYear?._id,
                createdBy: req.userId,
                schoolStartTime: '08:00',
                schoolEndTime:   '15:00',
                periodsStructure: Array.from({ length: 8 }, (_, i) => ({ periodNumber: i + 1, startTime: '', endTime: '', isRecess: false })),
            });
        }

        const entries = Array.isArray(req.body) ? req.body : req.body.entries || [];
        const toInsert = entries
            .filter(e => e.subject)
            .map(e => ({
                timetable:    tt._id,
                dayOfWeek:    e.dayOfWeek,
                periodNumber: e.periodNumber,
                subject:      e.subject,
                teacher:      e.teacher || null,
            }));

        // ── Teacher conflict check across other sections ────────────────────
        const conflicts = [];
        const teacherEntries = toInsert.filter(e => e.teacher);
        if (teacherEntries.length > 0) {
            // Find all other timetables in the same academic year (exclude this one)
            const sibling = await Timetable.find({ _id: { $ne: tt._id }, academicYear: tt.academicYear }).select('_id section').lean();
            const siblingIds = sibling.map(s => s._id);
            if (siblingIds.length > 0) {
                const existing = await TimetableEntry.find({ timetable: { $in: siblingIds }, teacher: { $in: teacherEntries.map(e => e.teacher) } })
                    .populate('timetable', 'section')
                    .populate('teacher', 'name')
                    .lean();
                teacherEntries.forEach(e => {
                    const clash = existing.find(x =>
                        String(x.teacher?._id || x.teacher) === String(e.teacher) &&
                        x.dayOfWeek === e.dayOfWeek &&
                        x.periodNumber === e.periodNumber
                    );
                    if (clash) {
                        conflicts.push({
                            teacher: clash.teacher?.name,
                            dayOfWeek: e.dayOfWeek,
                            periodNumber: e.periodNumber,
                            conflictSection: clash.timetable?.section,
                        });
                    }
                });
            }
        }

        // Save regardless — return conflicts as warnings so admin is informed
        await TimetableEntry.deleteMany({ timetable: tt._id });
        if (toInsert.length) await TimetableEntry.insertMany(toInsert);
        ok(res, { saved: toInsert.length, conflicts });
    } catch (e) { err(res, e); }
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
        const teachers = [...new Map(
            records.filter(r => r.teacher).map(r => [String(r.teacher._id), r.teacher])
        ).values()];
        ok(res, teachers);
    } catch (e) { err(res, e); }
};

exports.teacherViewTimetable = async (req, res) => {
    try {
        // Get all timetables in this school via active academic year
        const AcademicYear = require('../models/AcademicYear');
        const activeYear   = await AcademicYear.findOne({ school: req.schoolId, status: 'active' }).lean();
        const timetables   = await Timetable.find({ academicYear: activeYear?._id }).select('_id section').lean();
        const ttIds        = timetables.map(t => t._id);

        const entries = await TimetableEntry.find({ teacher: req.userId, timetable: { $in: ttIds } })
            .populate('subject')
            .populate({ path: 'timetable', populate: { path: 'section', select: 'name' } })
            .lean();

        // Normalize to {dayOfWeek, periodNumber, subject, section}
        const normalized = entries.map(e => ({
            _id:          e._id,
            dayOfWeek:    e.dayOfWeek,
            periodNumber: e.periodNumber,
            subject:      e.subject,
            section:      e.timetable?.section,
        }));
        ok(res, normalized);
    } catch (e) { err(res, e); }
};

exports.teacherDownloadTimetable = (req, res) => {
    res.json({ success: true, message: 'Download — implement PDF' });
};

exports.studentViewTimetable = async (req, res) => {
    try {
        const StudentProfile = require('../models/StudentProfile');
        const profile = await StudentProfile.findOne({ user: req.userId }).lean();
        const sectionId = profile?.currentSection || profile?.section;
        if (!sectionId) return ok(res, []);

        const tt = await Timetable.findOne({ section: sectionId }).lean();
        if (!tt) return ok(res, []);

        const entries = await TimetableEntry.find({ timetable: tt._id })
            .populate('subject teacher').lean();
        ok(res, entries);
    } catch (e) { err(res, e); }
};

exports.studentDownloadTimetable = (req, res) => {
    res.json({ success: true, message: 'Download — implement PDF' });
};
