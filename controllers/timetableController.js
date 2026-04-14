const Timetable = require('../models/Timetable');
const TimetableEntry = require('../models/TimetableEntry');
const ClassSection = require('../models/ClassSection');
const Subject = require('../models/Subject');
const User = require('../models/User');

const adminManageTimetable = async (req, res) => {
    try {
        const { sectionId } = req.params;
        const section = await ClassSection.findOne({ _id: sectionId, school: req.session.schoolId }).populate('class').populate('academicYear');
        if (!section) { req.flash('error', 'Section not found.'); return res.redirect('/admin/classes'); }

        let timetable = await Timetable.findOne({ section: sectionId, academicYear: section.academicYear._id || section.academicYear });
        
        res.render('admin/timetable/structure', {
            title: `Manage Timetable Config - ${section.sectionName}`,
            layout: 'layouts/main',
            section,
            timetable
        });
    } catch (err) {
        req.flash('error', 'Failed to load timetable manager.');
        res.redirect('/admin/classes');
    }
};

const adminSaveTimetableStructure = async (req, res) => {
    try {
        const { sectionId } = req.params;
        const { startTime, endTime, totalPeriods, lunchTimeTotalInMinutes, lunchAfterPeriod, openOnSaturday } = req.body;
        
        const section = await ClassSection.findOne({ _id: sectionId, school: req.session.schoolId });
        if (!section) { req.flash('error', 'Section not found.'); return res.redirect('/admin/classes'); }

        // Save config in ClassSection
        section.startTime = startTime || '08:00';
        section.endTime = endTime || '14:00';
        section.totalPeriods = parseInt(totalPeriods) || 8;
        section.lunchTimeTotalInMinutes = parseInt(lunchTimeTotalInMinutes) || 30;
        section.lunchAfterPeriod = parseInt(lunchAfterPeriod) || 4;
        section.openOnSaturday = openOnSaturday === 'on' || openOnSaturday === 'true' || openOnSaturday === true;
        await section.save();

        // Calculate Timetable Periods
        const parseTime = t => { const [h,m] = t.split(':'); return parseInt(h)*60 + parseInt(m); };
        const formatTime = m => {
            const hh = Math.floor(m / 60).toString().padStart(2, '0');
            const mm = Math.floor(m % 60).toString().padStart(2, '0');
            return `${hh}:${mm}`;
        };

        let startMin = parseTime(section.startTime);
        let endMin = parseTime(section.endTime);
        let totalAvail = endMin - startMin - section.lunchTimeTotalInMinutes;
        let periodLen = Math.floor(totalAvail / section.totalPeriods);
        let remainder = totalAvail % section.totalPeriods; // added to the last period if any
        
        let periodsStructure = [];
        let currentMin = startMin;
        let pCount = 1;

        for (let i = 1; i <= section.totalPeriods + 1; i++) {
            if (i - 1 === section.lunchAfterPeriod) {
                // Lunch Time!
                periodsStructure.push({
                    periodNumber: 0,
                    startTime: formatTime(currentMin),
                    endTime: formatTime(currentMin + section.lunchTimeTotalInMinutes),
                    isRecess: true,
                    recessName: 'Lunch'
                });
                currentMin += section.lunchTimeTotalInMinutes;
            }

            if (pCount <= section.totalPeriods) {
                let pDuration = periodLen;
                if (pCount === section.totalPeriods) {
                    pDuration += remainder; // remainder into the last period
                }
                
                let nextMin = currentMin + pDuration;
                periodsStructure.push({
                    periodNumber: pCount,
                    startTime: formatTime(currentMin),
                    endTime: formatTime(nextMin),
                    isRecess: false,
                    recessName: 'Period'
                });
                currentMin = nextMin;
                pCount++;
            }
        }

        let timetable = await Timetable.findOne({ section: sectionId, academicYear: section.academicYear });
        if (timetable) {
            timetable.schoolStartTime = section.startTime;
            timetable.schoolEndTime = section.endTime;
            timetable.periodsStructure = periodsStructure;
            await timetable.save();
        } else {
            await Timetable.create({
                section: sectionId,
                academicYear: section.academicYear,
                createdBy: req.session.userId,
                schoolStartTime: section.startTime,
                schoolEndTime: section.endTime,
                periodsStructure
            });
        }
        
        req.flash('success', 'Timetable automatically calculated and saved. Assign subjects below.');
        res.redirect(`/admin/sections/${sectionId}/timetable/entries`);
    } catch (err) {
        req.flash('error', 'Failed to save timetable structure: ' + err.message);
        res.redirect(`/admin/sections/${req.params.sectionId}/timetable`);
    }
};

const adminAssignPeriods = async (req, res) => {
    try {
        const { sectionId } = req.params;
        const section = await ClassSection.findOne({ _id: sectionId, school: req.session.schoolId }).populate('class').populate('academicYear');
        if (!section) { req.flash('error', 'Section not found.'); return res.redirect('/admin/classes'); }

        const timetable = await Timetable.findOne({ section: sectionId, academicYear: section.academicYear._id || section.academicYear });
        if (!timetable || !timetable.periodsStructure || timetable.periodsStructure.length === 0) {
            req.flash('error', 'Please configure timetable options first.');
            return res.redirect(`/admin/sections/${sectionId}/timetable`);
        }

        const entries = await TimetableEntry.find({ timetable: timetable._id }).populate('subject').populate('teacher');
        const subjects = await Subject.find({ school: req.session.schoolId });
        
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        if (section.openOnSaturday) days.push('Saturday');

        res.render('admin/timetable/entries', {
            title: `Assign Timetable - ${section.sectionName}`,
            layout: 'layouts/main',
            section,
            timetable,
            entries,
            subjects,
            days
        });
    } catch (err) {
        req.flash('error', 'Failed to load timetable assignment.');
        res.redirect(`/admin/sections/${req.params.sectionId}/timetable`);
    }
};

const adminSaveEntries = async (req, res) => {
    try {
        const { sectionId } = req.params;
        const section = await ClassSection.findOne({ _id: sectionId, school: req.session.schoolId });
        if (!section) { req.flash('error', 'Section not found.'); return res.redirect('/admin/classes'); }

        const timetable = await Timetable.findOne({ section: sectionId, academicYear: section.academicYear });
        if (!timetable) {
            req.flash('error', 'Timetable structure not found.');
            return res.redirect(`/admin/sections/${sectionId}/timetable`);
        }

        // Drop all old entries and replace with new ones
        await TimetableEntry.deleteMany({ timetable: timetable._id });

        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        if (section.openOnSaturday) days.push('Saturday');

        let newEntries = [];

        // Data from UI should be posted as nested arrays or specific names like: subject_Monday_1, teacher_Monday_1
        for (const day of days) {
            for (const period of timetable.periodsStructure) {
                if (period.isRecess) continue;
                
                const subjectId = req.body[`subject_${day}_${period.periodNumber}`];
                const teacherId = req.body[`teacher_${day}_${period.periodNumber}`];

                if (subjectId) {
                    newEntries.push({
                        timetable: timetable._id,
                        dayOfWeek: day,
                        periodNumber: period.periodNumber,
                        subject: subjectId,
                        teacher: teacherId || null
                    });
                }
            }
        }

        if (newEntries.length > 0) {
            await TimetableEntry.insertMany(newEntries);
        }

        req.flash('success', 'Timetable entries saved successfully.');
        res.redirect(`/admin/sections/${sectionId}/timetable`);
    } catch (err) {
        req.flash('error', 'Failed to save timetable entries: ' + err.message);
        res.redirect(`/admin/sections/${req.params.sectionId}/timetable/entries`);
    }
};

const apiGetTeachersBySubject = async (req, res) => {
    try {
        const { subjectId, day, period, timetableId } = req.query;
        
        const subject = await Subject.findOne({ _id: subjectId, school: req.session.schoolId }).populate({
            path: 'teachers',
            match: { isActive: true },
            select: 'name email'
        });
        
        if (!subject) return res.json({ success: false, message: 'Subject not found' });
        
        let potentialTeachers = subject.teachers || [];
            
        if (potentialTeachers.length === 0) {
             potentialTeachers = await User.find({ school: req.session.schoolId, role: 'teacher', isActive: true }).select('name email');
        }

        // Filter availability
        let availableTeachers = [];
        if (day && period) {
            for (const t of potentialTeachers) {
                let conflictQuery = {
                    teacher: t._id,
                    dayOfWeek: day,
                    periodNumber: period
                };
                if (timetableId) {
                    conflictQuery.timetable = { $ne: timetableId };
                }
                const conflict = await TimetableEntry.findOne(conflictQuery);
                if (!conflict) {
                    availableTeachers.push(t);
                }
            }
        } else {
            availableTeachers = potentialTeachers;
        }

        res.json({ success: true, teachers: availableTeachers });
        
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const teacherViewTimetable = async (req, res) => {
    try {
        const { searchTeacherId, yearId } = req.query;
        const targetTeacherId = searchTeacherId || req.session.userId;
        
        const targetTeacher = await User.findOne({ _id: targetTeacherId, school: req.session.schoolId, role: 'teacher' });
        if (!targetTeacher) {
            req.flash('error', 'Teacher not found.');
            return res.redirect('/teacher/dashboard');
        }

        const AcademicYear = require('../models/AcademicYear');
        const activeYear = await AcademicYear.findOne({ school: req.session.schoolId, status: 'active' });
        
        let selectedYearId = activeYear ? activeYear._id : null;
        let years = [];

        // If viewing self, allow changing year
        if (targetTeacherId.toString() === req.session.userId.toString()) {
            years = await AcademicYear.find({ school: req.session.schoolId }).sort({ createdAt: -1 });
            if (yearId) {
                selectedYearId = yearId;
            }
        } else {
            // For other teachers, strictly enforce active year
            selectedYearId = activeYear ? activeYear._id : null;
        }

        let entries = [];
        let periodsStructure = [];
        if (selectedYearId) {
            const timetables = await Timetable.find({ academicYear: selectedYearId });
            const timetableIds = timetables.map(t => t._id);

            // Get entries for this teacher for the specific academic year timetables
            entries = await TimetableEntry.find({
                teacher: targetTeacher._id,
                timetable: { $in: timetableIds }
            })
                .populate('subject')
                .populate({
                    path: 'timetable',
                    populate: {
                        path: 'section',
                        populate: { path: 'class' }
                    }
                });

            // Use the period structure from the first timetable that has entries
            // (all sections in a school share the same lunch break timing)
            const firstTimetableId = entries.length ? entries[0].timetable._id.toString() : null;
            const refTimetable = timetables.find(t => t._id.toString() === firstTimetableId)
                              || timetables[0];
            if (refTimetable && refTimetable.periodsStructure) {
                periodsStructure = refTimetable.periodsStructure;
            }
        }

        const allTeachers = await User.find({ school: req.session.schoolId, role: 'teacher', isActive: true }).select('name email');

        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        if (entries.some(e => e.dayOfWeek === 'Saturday')) days.push('Saturday');

        res.render('teacher/timetable', {
            title: `Timetable - ${targetTeacher.name}`,
            layout: 'layouts/main',
            entries,
            periodsStructure,
            targetTeacher,
            allTeachers,
            searchTeacherId,
            selectedYearId,
            years,
            days
        });
    } catch (err) {
        req.flash('error', 'Failed to load timetable.');
        res.redirect('/teacher/dashboard');
    }
};

const studentViewTimetable = async (req, res) => {
    try {
        const StudentProfile = require('../models/StudentProfile');
        const AcademicYear = require('../models/AcademicYear');

        const profile = await StudentProfile.findOne({ user: req.session.userId }).populate('currentSection');
        if (!profile || !profile.currentSection) {
            req.flash('error', 'You are not assigned to a section yet.');
            return res.redirect('/student/dashboard');
        }

        const sectionId = profile.currentSection._id;
        const section = await ClassSection.findById(sectionId).populate('class').populate('academicYear');

        // Always show timetable from the active academic year
        const activeYear = await AcademicYear.findOne({ school: req.session.schoolId, status: 'active' });

        let timetable = null;
        let effectiveSection = section; // section whose openOnSaturday/timing settings apply
        if (activeYear) {
            // First try: student's own section in the active year
            timetable = await Timetable.findOne({ section: sectionId, academicYear: activeYear._id })
                .populate({ path: 'section', populate: { path: 'class' } });

            // Second try: find the matching section in the active year by class name + section name
            // (Needed when student's currentSection belongs to a different academic year)
            if (!timetable && section && section.class) {
                const sectionsInActiveYear = await ClassSection.find({
                    school: req.session.schoolId,
                    sectionName: section.sectionName,
                    academicYear: activeYear._id
                }).populate('class');

                const matchingSection = sectionsInActiveYear.find(
                    s => s.class && s.class.className === section.class.className
                );

                if (matchingSection) {
                    timetable = await Timetable.findOne({ section: matchingSection._id, academicYear: activeYear._id })
                        .populate({ path: 'section', populate: { path: 'class' } });
                    effectiveSection = matchingSection;
                }
            }
        }

        let entries = [];
        if (timetable) {
            entries = await TimetableEntry.find({ timetable: timetable._id })
                .populate('subject')
                .populate('teacher');
        }

        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        if (effectiveSection.openOnSaturday) days.push('Saturday');

        res.render('student/timetable', {
            title: 'My Timetable',
            layout: 'layouts/main',
            timetable,
            section,
            entries,
            days,
            activeYear
        });
    } catch (err) {
        req.flash('error', 'Failed to load timetable.');
        res.redirect('/student/dashboard');
    }
};

// ── Shared helpers ─────────────────────────────────────────────

/**
 * Resolve active-year timetable for a student section.
 * Returns { timetable, effectiveSection, entries, days, activeYear }
 */
async function _resolveStudentTimetable(schoolId, currentSection) {
    const AcademicYear = require('../models/AcademicYear');
    const sectionId = currentSection._id;
    const section   = await ClassSection.findById(sectionId).populate('class').populate('academicYear');
    const activeYear = await AcademicYear.findOne({ school: schoolId, status: 'active' });

    let timetable = null;
    let effectiveSection = section;

    if (activeYear) {
        timetable = await Timetable.findOne({ section: sectionId, academicYear: activeYear._id });

        if (!timetable && section && section.class) {
            const candidates = await ClassSection.find({
                school: schoolId,
                sectionName: section.sectionName,
                academicYear: activeYear._id
            }).populate('class');

            const match = candidates.find(s => s.class && s.class.className === section.class.className);
            if (match) {
                timetable = await Timetable.findOne({ section: match._id, academicYear: activeYear._id });
                effectiveSection = match;
            }
        }
    }

    let entries = [];
    if (timetable) {
        entries = await TimetableEntry.find({ timetable: timetable._id })
            .populate('subject').populate('teacher');
    }

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    if (effectiveSection.openOnSaturday) days.push('Saturday');

    return { timetable, effectiveSection, section, entries, days, activeYear };
}

// ── Student download ───────────────────────────────────────────

const studentDownloadTimetable = async (req, res) => {
    try {
        const StudentProfile = require('../models/StudentProfile');
        const School = require('../models/School');

        const profile = await StudentProfile.findOne({ user: req.session.userId }).populate('currentSection');
        if (!profile || !profile.currentSection) {
            return res.status(404).send('You are not assigned to a section.');
        }

        const { timetable, effectiveSection, section, entries, days, activeYear } =
            await _resolveStudentTimetable(req.session.schoolId, profile.currentSection);

        if (!timetable) {
            return res.status(404).send('No timetable configured for your section in the active academic year.');
        }

        const school = await School.findById(req.session.schoolId);
        const { generateTimetablePDF } = require('../utils/timetablePdf');

        generateTimetablePDF(res, [{
            className:   section.class.className,
            sectionName: section.sectionName,
            yearName:    activeYear.yearName,
            timetable,
            entries,
            days
        }], school.name, 'my-timetable.pdf');

    } catch (err) {
        console.error(err);
        res.status(500).send('Failed to generate timetable PDF.');
    }
};

// ── Teacher download ───────────────────────────────────────────

const teacherDownloadTimetable = async (req, res) => {
    try {
        const AcademicYear = require('../models/AcademicYear');
        const School = require('../models/School');

        const teacher = await User.findOne({ _id: req.session.userId, school: req.session.schoolId, role: 'teacher' });
        if (!teacher) return res.status(404).send('Teacher not found.');

        const activeYear = await AcademicYear.findOne({ school: req.session.schoolId, status: 'active' });
        if (!activeYear) return res.status(404).send('No active academic year.');

        const timetables = await Timetable.find({ academicYear: activeYear._id });
        const timetableIds = timetables.map(t => t._id);
        const entries = await TimetableEntry.find({
            teacher: teacher._id,
            timetable: { $in: timetableIds }
        }).populate('subject').populate({
            path: 'timetable',
            populate: { path: 'section', populate: { path: 'class' } }
        });

        if (!entries.length) {
            return res.status(404).send('No timetable entries found for the active academic year.');
        }

        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        if (entries.some(e => e.dayOfWeek === 'Saturday')) days.push('Saturday');

        // Use the period structure (incl. lunch) from the first referenced timetable
        const firstTTId = entries[0].timetable._id.toString();
        const refTimetable = timetables.find(t => t._id.toString() === firstTTId) || timetables[0];
        const teacherTimetable = {
            periodsStructure: refTimetable ? refTimetable.periodsStructure : [],
            schoolStartTime:  refTimetable ? refTimetable.schoolStartTime : '',
            schoolEndTime:    refTimetable ? refTimetable.schoolEndTime : ''
        };

        const school = await School.findById(req.session.schoolId);
        const { generateTimetablePDF } = require('../utils/timetablePdf');

        generateTimetablePDF(res, [{
            className:   teacher.name,
            sectionName: 'Schedule',
            yearName:    activeYear.yearName,
            timetable:   teacherTimetable,
            entries,
            days
        }], school.name, 'my-timetable.pdf');

    } catch (err) {
        console.error(err);
        res.status(500).send('Failed to generate timetable PDF.');
    }
};

// ── Admin: single section download ────────────────────────────

const adminDownloadSectionTimetable = async (req, res) => {
    try {
        const School = require('../models/School');
        const { sectionId } = req.params;

        const section = await ClassSection.findOne({ _id: sectionId, school: req.session.schoolId })
            .populate('class').populate('academicYear');
        if (!section) return res.status(404).send('Section not found.');

        const timetable = await Timetable.findOne({
            section: sectionId,
            academicYear: section.academicYear._id || section.academicYear
        });
        if (!timetable) return res.status(404).send('No timetable configured for this section.');

        const entries = await TimetableEntry.find({ timetable: timetable._id })
            .populate('subject').populate('teacher');

        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        if (section.openOnSaturday) days.push('Saturday');

        const school = await School.findById(req.session.schoolId);
        const { generateTimetablePDF } = require('../utils/timetablePdf');

        generateTimetablePDF(res, [{
            className:   section.class.className,
            sectionName: section.sectionName,
            yearName:    section.academicYear.yearName,
            timetable,
            entries,
            days
        }], school.name, `timetable-${section.class.className}-${section.sectionName}.pdf`);

    } catch (err) {
        console.error(err);
        res.status(500).send('Failed to generate timetable PDF.');
    }
};

// ── Admin: all sections download ───────────────────────────────

const adminDownloadAllTimetables = async (req, res) => {
    try {
        const AcademicYear = require('../models/AcademicYear');
        const School = require('../models/School');

        // Use year from query param (passed from the classes page filter); fall back to active year
        let selectedYear;
        if (req.query.year) {
            selectedYear = await AcademicYear.findOne({ _id: req.query.year, school: req.session.schoolId });
        }
        if (!selectedYear) {
            selectedYear = await AcademicYear.findOne({ school: req.session.schoolId, status: 'active' });
        }
        if (!selectedYear) return res.status(404).send('No academic year found.');

        // All timetables for this school in the selected year
        const timetables = await Timetable.find({ academicYear: selectedYear._id })
            .populate({ path: 'section', populate: { path: 'class' } });

        if (!timetables.length) {
            const { generateMessagePDF } = require('../utils/timetablePdf');
            return generateMessagePDF(
                res,
                `No timetables configured for ${selectedYear.yearName}.`,
                `all-timetables-${selectedYear.yearName}.pdf`
            );
        }

        // Sort: by class name (numeric-aware), then section name
        timetables.sort((a, b) => {
            const ca = a.section?.class?.className || '';
            const cb = b.section?.class?.className || '';
            const cmp = ca.localeCompare(cb, undefined, { numeric: true });
            if (cmp !== 0) return cmp;
            return (a.section?.sectionName || '').localeCompare(b.section?.sectionName || '');
        });

        // Build pages
        const pages = await Promise.all(timetables.map(async tt => {
            const section = tt.section;
            if (!section) return null;
            const entries = await TimetableEntry.find({ timetable: tt._id })
                .populate('subject').populate('teacher');
            const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
            if (section.openOnSaturday) days.push('Saturday');
            return {
                className:   section.class?.className || 'Class',
                sectionName: section.sectionName,
                yearName:    selectedYear.yearName,
                timetable:   tt,
                entries,
                days
            };
        }));

        const validPages = pages.filter(Boolean);
        if (!validPages.length) {
            const { generateMessagePDF } = require('../utils/timetablePdf');
            return generateMessagePDF(
                res,
                `No timetable data found for ${selectedYear.yearName}.`,
                `all-timetables-${selectedYear.yearName}.pdf`
            );
        }

        const school = await School.findById(req.session.schoolId);
        const { generateTimetablePDF } = require('../utils/timetablePdf');

        generateTimetablePDF(res, validPages, school.name, `all-timetables-${selectedYear.yearName}.pdf`);

    } catch (err) {
        console.error(err);
        res.status(500).send('Failed to generate timetables PDF.');
    }
};

module.exports = {
    adminManageTimetable,
    adminSaveTimetableStructure,
    adminAssignPeriods,
    adminSaveEntries,
    apiGetTeachersBySubject,
    teacherViewTimetable,
    studentViewTimetable,
    studentDownloadTimetable,
    teacherDownloadTimetable,
    adminDownloadSectionTimetable,
    adminDownloadAllTimetables
};
