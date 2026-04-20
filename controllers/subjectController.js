const Subject = require('../models/Subject');
const ClassSubject = require('../models/ClassSubject');
const SectionSubjectTeacher = require('../models/SectionSubjectTeacher');
const Class = require('../models/Class');
const ClassSection = require('../models/ClassSection');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');

/* ─────────────────────────────────────────────
   SUBJECTS
───────────────────────────────────────────── */

const getSubjects = async (req, res) => {
    try {
        const subjects = await Subject.find({ school: req.session.schoolId })
            .populate('teachers', 'name email profileImage')
            .sort({ subjectName: 1 });
        const teachers = await User.find({ role: 'teacher', school: req.session.schoolId, isActive: true })
            .select('name email')
            .sort({ name: 1 });
        res.render('admin/subjects/index', {
            title: 'Subjects', layout: 'layouts/main', subjects, teachers
        });
    } catch (err) {
        req.flash('error', 'Failed to load subjects.'); res.redirect('/admin/dashboard');
    }
};

const postCreateSubject = async (req, res) => {
    try {
        const { subjectName, subjectCode, description, teachers } = req.body;
        let assignedTeachers = [];
        if (teachers) {
            assignedTeachers = Array.isArray(teachers) ? teachers : [teachers];
        }
        await Subject.create({
            school: req.session.schoolId,
            subjectName: subjectName.trim(),
            subjectCode: subjectCode.trim().toUpperCase(),
            description: description || '',
            teachers: assignedTeachers
        });
        req.flash('success', `Subject "${subjectName}" created.`);
        res.redirect('/admin/subjects');
    } catch (err) {
        if (err.code === 11000) {
            req.flash('error', 'A subject with that code already exists.');
        } else {
            req.flash('error', 'Failed to create subject: ' + err.message);
        }
        res.redirect('/admin/subjects');
    }
};

const postDeleteSubject = async (req, res) => {
    try {
        await Subject.findOneAndDelete({ _id: req.params.subjectId, school: req.session.schoolId });
        req.flash('success', 'Subject deleted.');
        res.redirect('/admin/subjects');
    } catch (err) {
        req.flash('error', 'Failed to delete subject.'); res.redirect('/admin/subjects');
    }
};

const getEditSubject = async (req, res) => {
    try {
        const subject = await Subject.findOne({ _id: req.params.subjectId, school: req.session.schoolId })
            .populate('teachers', 'name email');
        if (!subject) {
            req.flash('error', 'Subject not found.');
            return res.redirect('/admin/subjects');
        }
        const teachers = await User.find({ role: 'teacher', school: req.session.schoolId, isActive: true })
            .select('name email')
            .sort({ name: 1 });

        res.render('admin/subjects/edit', {
            title: 'Edit Subject', layout: 'layouts/main',
            subject, teachers
        });
    } catch (err) {
        req.flash('error', 'Failed to load subject for editing.'); res.redirect('/admin/subjects');
    }
};

const postEditSubject = async (req, res) => {
    try {
        const { subjectName, subjectCode, description, teachers } = req.body;
        // teachers could be undefined, string or array
        let assignedTeachers = [];
        if (teachers) {
            assignedTeachers = Array.isArray(teachers) ? teachers : [teachers];
        }

        await Subject.findOneAndUpdate(
            { _id: req.params.subjectId, school: req.session.schoolId },
            {
                subjectName: subjectName.trim(),
                subjectCode: subjectCode.trim().toUpperCase(),
                description: description || '',
                teachers: assignedTeachers
            }
        );
        req.flash('success', `Subject "${subjectName}" updated successfully.`);
        res.redirect('/admin/subjects');
    } catch (err) {
        if (err.code === 11000) {
            req.flash('error', 'A subject with that code already exists.');
        } else {
            req.flash('error', 'Failed to update subject: ' + err.message);
        }
        res.redirect('/admin/subjects');
    }
};

/* ─────────────────────────────────────────────
   CLASS SUBJECTS (assign subjects to a class)
───────────────────────────────────────────── */

const getClassSubjects = async (req, res) => {
    try {
        const cls = await Class.findOne({ _id: req.params.classId, school: req.session.schoolId });
        if (!cls) { req.flash('error', 'Class not found.'); return res.redirect('/admin/classes'); }

        const assigned = await ClassSubject.find({ class: cls._id }).populate('subject');
        const assignedIds = assigned.map(cs => cs.subject._id.toString());
        const allSubjects = await Subject.find({ school: req.session.schoolId }).sort({ subjectName: 1 });
        const available = allSubjects.filter(s => !assignedIds.includes(s._id.toString()));

        res.render('admin/subjects/classSubjects', {
            title: `Subjects — ${cls.className}`, layout: 'layouts/main',
            cls, assigned, available,
        });
    } catch (err) {
        req.flash('error', 'Failed to load class subjects.'); res.redirect('/admin/classes');
    }
};

const postAssignSubjectToClass = async (req, res) => {
    const { classId } = req.params;
    try {
        const { subjectId } = req.body;
        await ClassSubject.create({ class: classId, subject: subjectId });
        req.flash('success', 'Subject assigned to class.');
        res.redirect(`/admin/classes/${classId}/subjects`);
    } catch (err) {
        if (err.code === 11000) {
            req.flash('error', 'Subject already assigned to this class.');
        } else {
            req.flash('error', 'Failed to assign subject: ' + err.message);
        }
        res.redirect(`/admin/classes/${classId}/subjects`);
    }
};

const postRemoveSubjectFromClass = async (req, res) => {
    const { classId } = req.params;
    try {
        await ClassSubject.findOneAndDelete({ class: classId, subject: req.body.subjectId });
        req.flash('success', 'Subject removed from class.');
        res.redirect(`/admin/classes/${classId}/subjects`);
    } catch (err) {
        req.flash('error', 'Failed to remove subject.'); res.redirect(`/admin/classes/${classId}/subjects`);
    }
};

/* ─────────────────────────────────────────────
   SECTION SUBJECT TEACHERS
───────────────────────────────────────────── */

const getSectionSubjectTeachers = async (req, res) => {
    try {
        const section = await ClassSection.findOne({ _id: req.params.sectionId, school: req.session.schoolId })
            .populate('class');
        if (!section) { req.flash('error', 'Section not found.'); return res.redirect('/admin/classes'); }

        // Subjects for this class with eligible teachers from subject.teachers
        const classSubjects = await ClassSubject.find({ class: section.class._id })
            .populate({ path: 'subject', populate: { path: 'teachers', select: 'name email', match: { isActive: true } } });

        // All current assignments for this section
        const rawAssignments = await SectionSubjectTeacher.find({ section: section._id })
            .populate('subject', 'subjectName').populate('teacher', 'name email');

        // Build map: subjectId → [teacher, ...]
        const assignedMap = {};
        rawAssignments.forEach(a => {
            const sid = a.subject._id.toString();
            if (!assignedMap[sid]) assignedMap[sid] = { subject: a.subject, teachers: [] };
            if (a.teacher) assignedMap[sid].teachers.push(a.teacher);
        });

        res.render('admin/sections/subjectTeachers', {
            title: `Subject Teachers — Section ${section.sectionName}`, layout: 'layouts/main',
            section, classSubjects, assignedMap,
        });
    } catch (err) {
        req.flash('error', 'Failed to load subject teachers.'); res.redirect('/admin/classes');
    }
};

const postAssignSubjectTeacher = async (req, res) => {
    const { sectionId } = req.params;
    try {
        const { subjectId, teacherIds } = req.body;
        const ids = Array.isArray(teacherIds) ? teacherIds : teacherIds ? [teacherIds] : [];

        // Replace all assignments for this section+subject with the new set
        await SectionSubjectTeacher.deleteMany({ section: sectionId, subject: subjectId });
        if (ids.length > 0) {
            await SectionSubjectTeacher.insertMany(
                ids.map(tid => ({ section: sectionId, subject: subjectId, teacher: tid }))
            );
        }
        req.flash('success', 'Teachers updated for subject.');
        res.redirect(`/admin/sections/${sectionId}/subjects`);
    } catch (err) {
        req.flash('error', 'Failed to assign teachers: ' + err.message);
        res.redirect(`/admin/sections/${sectionId}/subjects`);
    }
};

const postRemoveSectionSubject = async (req, res) => {
    const { sectionId, subjectId } = req.params;
    try {
        await SectionSubjectTeacher.deleteMany({ section: sectionId, subject: subjectId });
        req.flash('success', 'Subject removed from section.');
        res.redirect(`/admin/sections/${sectionId}/subjects`);
    } catch (err) {
        req.flash('error', 'Failed to remove subject: ' + err.message);
        res.redirect(`/admin/sections/${sectionId}/subjects`);
    }
};

module.exports = {
    getSubjects, postCreateSubject, postDeleteSubject, getEditSubject, postEditSubject,
    getClassSubjects, postAssignSubjectToClass, postRemoveSubjectFromClass,
    getSectionSubjectTeachers, postAssignSubjectTeacher, postRemoveSectionSubject,
};
