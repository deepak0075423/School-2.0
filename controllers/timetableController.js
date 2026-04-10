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
            title: `Manage Timetable Structure - ${section.sectionName}`,
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
        const { schoolStartTime, schoolEndTime, periodNumbers, startTimes, endTimes, recesses, recessNames } = req.body;
        
        const section = await ClassSection.findOne({ _id: sectionId, school: req.session.schoolId });
        if (!section) { req.flash('error', 'Section not found.'); return res.redirect('/admin/classes'); }

        let periodsStructure = [];
        if (Array.isArray(startTimes)) {
            for (let i = 0; i < startTimes.length; i++) {
                periodsStructure.push({
                    periodNumber: periodNumbers ? parseInt(periodNumbers[i]) || (i+1) : (i+1),
                    startTime: startTimes[i],
                    endTime: endTimes[i],
                    isRecess: recesses && recesses[i] === 'true',
                    recessName: recessNames && recessNames[i] ? recessNames[i] : 'Break'
                });
            }
        } else if (startTimes) {
            periodsStructure.push({
                periodNumber: parseInt(periodNumbers) || 1,
                startTime: startTimes,
                endTime: endTimes,
                isRecess: recesses === 'true',
                recessName: recessNames || 'Break'
            });
        }

        let timetable = await Timetable.findOne({ section: sectionId, academicYear: section.academicYear });
        if (timetable) {
            timetable.schoolStartTime = schoolStartTime;
            timetable.schoolEndTime = schoolEndTime;
            timetable.periodsStructure = periodsStructure;
            await timetable.save();
        } else {
            await Timetable.create({
                section: sectionId,
                academicYear: section.academicYear,
                createdBy: req.session.userId,
                schoolStartTime,
                schoolEndTime,
                periodsStructure
            });
        }
        req.flash('success', 'Timetable structure saved. Now you can assign subjects and teachers.');
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
            req.flash('error', 'Please define timetable structure first.');
            return res.redirect(`/admin/sections/${sectionId}/timetable`);
        }

        const entries = await TimetableEntry.find({ timetable: timetable._id }).populate('subject').populate('teacher');
        const subjects = await Subject.find({ school: req.session.schoolId });
        
        res.render('admin/timetable/entries', {
            title: `Assign Timetable - ${section.sectionName}`,
            layout: 'layouts/main',
            section,
            timetable,
            entries,
            subjects,
            days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
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

        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
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
        const { subjectId } = req.query;
        // In the existing models, Teachers can be found via TeacherProfile.subjects or SectionSubjectTeacher.
        // Let's just find all active teachers for the school since the UI is simple and can allow picking any teacher.
        // Wait, the prompt specifically requested filtering: 
        // "when assigning hindi teacher it will show all the avaliable teacher who takes hindi class"
        
        // Let's look up the actual subject
        const subject = await Subject.findOne({ _id: subjectId, school: req.session.schoolId });
        if (!subject) return res.json({ success: false, message: 'Subject not found' });
        
        const TeacherProfile = require('../models/TeacherProfile');
        
        // Find teachers who have this subject name in their subjects array
        // Fallback: If no teacher explicitly lists the subject, perhaps return all? 
        // Let's strictly return teachers who have this subject in their profile OR all teachers if we want to be safe?
        // To be strict as requested:
        
        const profiles = await TeacherProfile.find({
            school: req.session.schoolId,
            subjects: { $regex: new RegExp(`^${subject.subjectName}$`, 'i') }
        }).populate({
            path: 'user',
            match: { isActive: true }
        });

        const teachers = profiles
            .filter(p => p.user) // Filter out null users (inactive)
            .map(p => ({
                _id: p.user._id,
                name: p.user.name,
                email: p.user.email
            }));
            
        // If no teachers found for the specific subject, optionally return all
        if (teachers.length === 0) {
             const allTeachers = await User.find({ school: req.session.schoolId, role: 'teacher', isActive: true });
             res.json({ success: true, teachers: allTeachers.map(t => ({ _id: t._id, name: t.name, email: t.email })), note: 'All teachers returned as none specifically matched the subject.' });
        } else {
             res.json({ success: true, teachers });
        }
        
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const teacherViewTimetable = async (req, res) => {
    try {
        const { searchTeacherId } = req.query;
        const targetTeacherId = searchTeacherId || req.session.userId;
        
        const targetTeacher = await User.findOne({ _id: targetTeacherId, school: req.session.schoolId, role: 'teacher' });
        if (!targetTeacher) {
            req.flash('error', 'Teacher not found.');
            return res.redirect('/teacher/dashboard');
        }

        // Get all entries for this teacher across all timetables
        const entries = await TimetableEntry.find({ teacher: targetTeacher._id })
            .populate('subject')
            .populate({
                path: 'timetable',
                populate: {
                    path: 'section',
                    populate: { path: 'class' }
                }
            });

        // Let's also fetch all teachers in the school for the search dropdown
        const allTeachers = await User.find({ school: req.session.schoolId, role: 'teacher', isActive: true }).select('name email');

        res.render('teacher/timetable', {
            title: `Timetable - ${targetTeacher.name}`,
            layout: 'layouts/main',
            entries,
            targetTeacher,
            allTeachers,
            searchTeacherId,
            days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        });
    } catch (err) {
        req.flash('error', 'Failed to load timetable.');
        res.redirect('/teacher/dashboard');
    }
};

const studentViewTimetable = async (req, res) => {
    try {
        const StudentProfile = require('../models/StudentProfile');
        const profile = await StudentProfile.findOne({ user: req.session.userId }).populate('currentSection');
        if (!profile || !profile.currentSection) {
            req.flash('error', 'You are not assigned to a section yet.');
            return res.redirect('/student/dashboard');
        }

        const sectionId = profile.currentSection._id;
        const timetable = await Timetable.findOne({ section: sectionId, academicYear: profile.currentSection.academicYear });
        
        let entries = [];
        if (timetable) {
            entries = await TimetableEntry.find({ timetable: timetable._id })
                .populate('subject')
                .populate('teacher');
        }

        res.render('student/timetable', {
            title: 'My Timetable',
            layout: 'layouts/main',
            timetable,
            entries,
            days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        });
    } catch (err) {
        req.flash('error', 'Failed to load timetable.');
        res.redirect('/student/dashboard');
    }
};

module.exports = {
    adminManageTimetable,
    adminSaveTimetableStructure,
    adminAssignPeriods,
    adminSaveEntries,
    apiGetTeachersBySubject,
    teacherViewTimetable,
    studentViewTimetable
};
