const AcademicYear = require('../models/AcademicYear');
const Class = require('../models/Class');
const ClassSection = require('../models/ClassSection');
const StudentSectionHistory = require('../models/StudentSectionHistory');
const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');
const StudentProfile = require('../models/StudentProfile');
const mongoose = require('mongoose');

/* ─────────────────────────────────────────────
   ACADEMIC YEARS
───────────────────────────────────────────── */

const getAcademicYears = async (req, res) => {
    try {
        const years = await AcademicYear.find({ school: req.session.schoolId }).sort({ createdAt: -1 });
        res.render('admin/academicYears/index', {
            title: 'Academic Years',
            layout: 'layouts/main',
            years,
        });
    } catch (err) {
        req.flash('error', 'Failed to load academic years.');
        res.redirect('/admin/dashboard');
    }
};

const postCreateAcademicYear = async (req, res) => {
    try {
        const { yearName, startDate, endDate, status } = req.body;
        await AcademicYear.create({
            school: req.session.schoolId,
            yearName: yearName.trim(),
            startDate,
            endDate,
            status: status || 'active',
            createdBy: req.session.userId,
        });
        await ActivityLog.create({
            user: req.session.userId, school: req.session.schoolId,
            actionType: 'CREATE_ACADEMIC_YEAR', entityType: 'AcademicYear',
            newValue: { yearName },
        });
        req.flash('success', `Academic Year "${yearName}" created.`);
        res.redirect('/admin/academic-years');
    } catch (err) {
        if (err.code === 11000) {
            req.flash('error', 'An academic year with that name already exists for this school.');
        } else {
            req.flash('error', 'Failed to create academic year: ' + err.message);
        }
        res.redirect('/admin/academic-years');
    }
};

const postDeleteAcademicYear = async (req, res) => {
    try {
        const year = await AcademicYear.findOneAndDelete({ _id: req.params.id, school: req.session.schoolId });
        if (!year) { req.flash('error', 'Academic year not found.'); return res.redirect('/admin/academic-years'); }
        req.flash('success', 'Academic year deleted.');
        res.redirect('/admin/academic-years');
    } catch (err) {
        req.flash('error', 'Failed to delete: ' + err.message);
        res.redirect('/admin/academic-years');
    }
};

/* ─────────────────────────────────────────────
   CLASSES
───────────────────────────────────────────── */

const getClasses = async (req, res) => {
    try {
        const years = await AcademicYear.find({ school: req.session.schoolId }).sort({ yearName: 1 });
        const selectedYear = req.query.year || (years.find(y => y.status === 'active') || years[0] || {})._id;
        const classes = selectedYear
            ? await Class.find({ school: req.session.schoolId, academicYear: selectedYear })
                .populate('academicYear').sort({ classNumber: 1 })
            : [];

        // For each class, get section count
        const ClassSection = require('../models/ClassSection');
        const classSections = await ClassSection.aggregate([
            { $match: { school: new mongoose.Types.ObjectId(req.session.schoolId) } },
            { $group: { _id: '$class', count: { $sum: 1 }, students: { $sum: '$currentCount' } } },
        ]);
        const sectionMap = {};
        classSections.forEach(cs => { sectionMap[cs._id.toString()] = cs; });

        res.render('admin/classes/index', {
            title: 'Classes', layout: 'layouts/main',
            classes, years, selectedYear, sectionMap,
        });
    } catch (err) {
        req.flash('error', 'Failed to load classes.'); res.redirect('/admin/dashboard');
    }
};

const getCreateClass = async (req, res) => {
    try {
        const years = await AcademicYear.find({ school: req.session.schoolId, status: 'active' }).sort({ yearName: 1 });
        res.render('admin/classes/create', { title: 'Create Class', layout: 'layouts/main', years });
    } catch (err) {
        req.flash('error', 'Failed to load form.'); res.redirect('/admin/classes');
    }
};

const postCreateClass = async (req, res) => {
    try {
        const { classNumber, className, academicYear, status } = req.body;
        const cls = await Class.create({
            school: req.session.schoolId,
            academicYear,
            classNumber: parseInt(classNumber),
            className: className.trim(),
            status: status || 'active',
            createdBy: req.session.userId,
        });
        await ActivityLog.create({
            user: req.session.userId, school: req.session.schoolId,
            actionType: 'CREATE_CLASS', entityType: 'Class', entityId: cls._id,
            newValue: { classNumber, className },
        });
        req.flash('success', `Class "${className}" created.`);
        res.redirect('/admin/classes');
    } catch (err) {
        if (err.code === 11000) {
            req.flash('error', 'A class with that number already exists in this academic year.');
        } else {
            req.flash('error', 'Failed to create class: ' + err.message);
        }
        res.redirect('/admin/classes/create');
    }
};

const getClassDetail = async (req, res) => {
    try {
        const cls = await Class.findOne({ _id: req.params.classId, school: req.session.schoolId })
            .populate('academicYear');
        if (!cls) { req.flash('error', 'Class not found.'); return res.redirect('/admin/classes'); }
        const sections = await ClassSection.find({ class: cls._id })
            .populate('classTeacher', 'name email')
            .populate('substituteTeacher', 'name email')
            .sort({ sectionName: 1 });
            
        // Get occupied teachers
        const occupiedSections = await ClassSection.find({ school: req.session.schoolId });
        const occupiedTeacherIds = [];
        occupiedSections.forEach(sec => {
            if (sec.classTeacher) occupiedTeacherIds.push(sec.classTeacher.toString());
            if (sec.substituteTeacher) occupiedTeacherIds.push(sec.substituteTeacher.toString());
        });

        // Filter unassigned active teachers
        const teachers = await User.find({ role: 'teacher', school: req.session.schoolId, isActive: true })
            .select('name email');
        const availableTeachers = teachers.filter(t => !occupiedTeacherIds.includes(t._id.toString()));

        res.render('admin/classes/show', {
            title: `Class ${cls.className}`, layout: 'layouts/main',
            cls, sections, teachers: availableTeachers,
        });
    } catch (err) {
        req.flash('error', 'Failed to load class.'); res.redirect('/admin/classes');
    }
};

const postDeleteClass = async (req, res) => {
    try {
        await Class.findOneAndDelete({ _id: req.params.classId, school: req.session.schoolId });
        req.flash('success', 'Class deleted.');
        res.redirect('/admin/classes');
    } catch (err) {
        req.flash('error', 'Failed to delete class.'); res.redirect('/admin/classes');
    }
};

/* ─────────────────────────────────────────────
   SECTIONS
───────────────────────────────────────────── */

const postCreateSection = async (req, res) => {
    const { classId } = req.params;
    try {
        const cls = await Class.findOne({ _id: classId, school: req.session.schoolId });
        if (!cls) { req.flash('error', 'Class not found.'); return res.redirect('/admin/classes'); }

        const { sectionName, classTeacher, substituteTeacher, maxStudents, status } = req.body;

        // Verify section name uniqueness for this class specifically
        const existingSectionName = await ClassSection.findOne({ class: classId, sectionName: sectionName.trim().toUpperCase() });
        if (existingSectionName) {
            req.flash('error', `Section "${sectionName}" already exists in this class.`);
            return res.redirect(`/admin/classes/${classId}`);
        }

        // Validate teacher conflict
        const ct = classTeacher ? classTeacher.toString().trim() : '';
        const st = substituteTeacher ? substituteTeacher.toString().trim() : '';
        
        if (ct && st && ct === st) {
            req.flash('error', 'Class teacher and substitute teacher cannot be the same person.');
            return res.redirect(`/admin/classes/${classId}`);
        }
        
        // Verify teacher globabl availability
        if (ct || st) {
            const checkIds = [];
            if (ct) checkIds.push(ct);
            if (st) checkIds.push(st);
            
            const occupied = await ClassSection.findOne({
                school: req.session.schoolId,
                $or: [
                    { classTeacher: { $in: checkIds } },
                    { substituteTeacher: { $in: checkIds } }
                ]
            });
            if (occupied) {
                req.flash('error', 'One or both of the selected teachers are already assigned to a section.');
                return res.redirect(`/admin/classes/${classId}`);
            }
        }

        const section = await ClassSection.create({
            school: req.session.schoolId,
            class: classId,
            academicYear: cls.academicYear,
            sectionName: sectionName.trim().toUpperCase(),
            classTeacher: classTeacher || null,
            substituteTeacher: substituteTeacher || null,
            maxStudents: parseInt(maxStudents) || 40,
            status: status || 'active',
        });
        await ActivityLog.create({
            user: req.session.userId, school: req.session.schoolId,
            actionType: 'CREATE_SECTION', entityType: 'ClassSection', entityId: section._id,
            newValue: { sectionName },
        });
        req.flash('success', `Section "${sectionName}" created.`);
        res.redirect(`/admin/classes/${classId}`);
    } catch (err) {
        if (err.code === 11000) {
            req.flash('error', 'Section name or code already exists. Please use unique values.');
        } else {
            req.flash('error', 'Failed to create section: ' + err.message);
        }
        res.redirect(`/admin/classes/${classId}`);
    }
};

const getSectionDetail = async (req, res) => {
    try {
        const section = await ClassSection.findOne({ _id: req.params.sectionId, school: req.session.schoolId })
            .populate('class').populate('academicYear')
            .populate('classTeacher', 'name email')
            .populate('substituteTeacher', 'name email');
        if (!section) { req.flash('error', 'Section not found.'); return res.redirect('/admin/classes'); }

        // Students in this section
        const studentProfiles = await StudentProfile.find({ currentSection: section._id, school: req.session.schoolId })
            .populate('user', 'name email phone');

        // All students NOT yet in a section (for assign dropdown)
        const unassignedProfiles = await StudentProfile.find({
            school: req.session.schoolId,
            $or: [{ currentSection: null }, { currentSection: { $exists: false } }],
        }).populate('user', 'name email');

        // Filter unassigned active teachers
        const occupiedSections = await ClassSection.find({ school: req.session.schoolId, _id: { $ne: section._id } });
        const occupiedTeacherIds = [];
        occupiedSections.forEach(sec => {
            if (sec.classTeacher) occupiedTeacherIds.push(sec.classTeacher.toString());
            if (sec.substituteTeacher) occupiedTeacherIds.push(sec.substituteTeacher.toString());
        });

        const teachers = await User.find({ role: 'teacher', school: req.session.schoolId, isActive: true })
            .select('name email');
        const availableTeachers = teachers.filter(t => !occupiedTeacherIds.includes(t._id.toString()));

        res.render('admin/sections/show', {
            title: `Section ${section.sectionName}`, layout: 'layouts/main',
            section, studentProfiles, unassignedProfiles, teachers: availableTeachers,
        });
    } catch (err) {
        req.flash('error', 'Failed to load section.'); res.redirect('/admin/classes');
    }
};

const postAssignStudentToSection = async (req, res) => {
    const { sectionId } = req.params;
    try {
        const section = await ClassSection.findOne({ _id: sectionId, school: req.session.schoolId });
        if (!section) { req.flash('error', 'Section not found.'); return res.redirect('/admin/classes'); }

        // Capacity check
        if (section.currentCount >= section.maxStudents) {
            req.flash('error', `Section is at full capacity (${section.maxStudents} students).`);
            return res.redirect(`/admin/sections/${sectionId}`);
        }

        const { studentId } = req.body;
        const profile = await StudentProfile.findOne({ user: studentId, school: req.session.schoolId });
        if (!profile) { req.flash('error', 'Student profile not found.'); return res.redirect(`/admin/sections/${sectionId}`); }

        const oldSectionId = profile.currentSection || null;

        // Decrement old section count
        if (oldSectionId) {
            await ClassSection.findByIdAndUpdate(oldSectionId, { $inc: { currentCount: -1 } });
        }

        // Assign to new section
        profile.currentSection = sectionId;
        await profile.save();

        // Increment new section count
        await ClassSection.findByIdAndUpdate(sectionId, { $inc: { currentCount: 1 } });

        // Record history
        await StudentSectionHistory.create({
            student: studentId,
            oldSection: oldSectionId,
            newSection: sectionId,
            transferReason: req.body.reason || 'Initial assignment',
            transferredBy: req.session.userId,
        });
        req.flash('success', 'Student assigned to section successfully.');
        res.redirect(`/admin/sections/${sectionId}`);
    } catch (err) {
        req.flash('error', 'Failed to assign student: ' + err.message);
        res.redirect(`/admin/sections/${sectionId}`);
    }
};

const postRemoveStudentFromSection = async (req, res) => {
    const { sectionId } = req.params;
    try {
        const { studentId } = req.body;
        const profile = await StudentProfile.findOne({ user: studentId, school: req.session.schoolId });
        if (profile && profile.currentSection && profile.currentSection.toString() === sectionId) {
            profile.currentSection = null;
            await profile.save();
            await ClassSection.findByIdAndUpdate(sectionId, { $inc: { currentCount: -1 } });
            await StudentSectionHistory.create({
                student: studentId,
                oldSection: sectionId,
                newSection: null,
                transferReason: 'Removed from section',
                transferredBy: req.session.userId,
            });
        }
        req.flash('success', 'Student removed from section.');
        res.redirect(`/admin/sections/${sectionId}`);
    } catch (err) {
        req.flash('error', 'Failed to remove student: ' + err.message);
        res.redirect(`/admin/sections/${sectionId}`);
    }
};

const postUpdateSectionTeacher = async (req, res) => {
    const { sectionId } = req.params;
    try {
        const { classTeacher, substituteTeacher } = req.body;
        const ct = classTeacher ? classTeacher.toString().trim() : '';
        const st = substituteTeacher ? substituteTeacher.toString().trim() : '';

        if (ct && st && ct === st) {
            req.flash('error', 'Class teacher and substitute teacher cannot be the same person.');
            return res.redirect(`/admin/sections/${sectionId}`);
        }
        
        // Block already assigned teachers
        if (ct || st) {
            const checkIds = [];
            if (ct) checkIds.push(ct);
            if (st) checkIds.push(st);
            
            const occupied = await ClassSection.findOne({
                school: req.session.schoolId,
                _id: { $ne: sectionId },
                $or: [
                    { classTeacher: { $in: checkIds } },
                    { substituteTeacher: { $in: checkIds } }
                ]
            });
            if (occupied) {
                req.flash('error', 'One or both of the selected teachers are already assigned to another section.');
                return res.redirect(`/admin/sections/${sectionId}`);
            }
        }

        await ClassSection.findOneAndUpdate(
            { _id: sectionId, school: req.session.schoolId },
            { classTeacher: classTeacher || null, substituteTeacher: substituteTeacher || null }
        );
        req.flash('success', 'Section teachers updated.');
        res.redirect(`/admin/sections/${sectionId}`);
    } catch (err) {
        req.flash('error', 'Failed to update teachers: ' + err.message);
        res.redirect(`/admin/sections/${sectionId}`);
    }
};

const postUpdateSectionCapacity = async (req, res) => {
    const { sectionId } = req.params;
    try {
        const maxStudents = parseInt(req.body.maxStudents);
        if (!maxStudents || maxStudents < 1) {
            req.flash('error', 'Capacity must be at least 1.');
            return res.redirect(`/admin/sections/${sectionId}`);
        }
        const section = await ClassSection.findOne({ _id: sectionId, school: req.session.schoolId });
        if (!section) { req.flash('error', 'Section not found.'); return res.redirect('/admin/classes'); }

        if (maxStudents < section.currentCount) {
            req.flash('error', `Capacity cannot be less than current enrollment (${section.currentCount} students).`);
            return res.redirect(`/admin/sections/${sectionId}`);
        }

        await ClassSection.findByIdAndUpdate(sectionId, { maxStudents });
        req.flash('success', `Capacity updated to ${maxStudents} students.`);
        res.redirect(`/admin/sections/${sectionId}`);
    } catch (err) {
        req.flash('error', 'Failed to update capacity: ' + err.message);
        res.redirect(`/admin/sections/${sectionId}`);
    }
};

const postDeleteSection = async (req, res) => {
    const { sectionId } = req.params;
    try {
        const section = await ClassSection.findOneAndDelete({ _id: sectionId, school: req.session.schoolId });
        const classId = section ? section.class : null;
        req.flash('success', 'Section deleted.');
        res.redirect(classId ? `/admin/classes/${classId}` : '/admin/classes');
    } catch (err) {
        req.flash('error', 'Failed to delete section.'); res.redirect('/admin/classes');
    }
};

module.exports = {
    // Academic years
    getAcademicYears, postCreateAcademicYear, postDeleteAcademicYear,
    // Classes
    getClasses, getCreateClass, postCreateClass, getClassDetail, postDeleteClass,
    // Sections
    postCreateSection, getSectionDetail,
    postAssignStudentToSection, postRemoveStudentFromSection,
    postUpdateSectionTeacher, postUpdateSectionCapacity, postDeleteSection,
};
