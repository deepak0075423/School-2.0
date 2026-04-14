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
        const newYearStatus = status || 'active';
        const newYear = await AcademicYear.create({
            school: req.session.schoolId,
            yearName: yearName.trim(),
            startDate,
            endDate,
            status: newYearStatus,
            createdBy: req.session.userId,
        });

        if (newYearStatus === 'active') {
             // Set all other years to inactive to maintain single source of truth
             await AcademicYear.updateMany(
                 { school: req.session.schoolId, _id: { $ne: newYear._id } },
                 { $set: { status: 'inactive' } }
             );
        }

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

const getEditAcademicYear = async (req, res) => {
    try {
        const year = await AcademicYear.findOne({ _id: req.params.id, school: req.session.schoolId });
        if (!year) {
            req.flash('error', 'Academic year not found.');
            return res.redirect('/admin/academic-years');
        }
        res.render('admin/academicYears/edit', { title: 'Edit Academic Year', layout: 'layouts/main', year });
    } catch (err) {
        req.flash('error', 'Failed to load form: ' + err.message);
        res.redirect('/admin/academic-years');
    }
};

const postEditAcademicYear = async (req, res) => {
    try {
        const { yearName, startDate, endDate, status } = req.body;
        const year = await AcademicYear.findOne({ _id: req.params.id, school: req.session.schoolId });
        if (!year) {
            req.flash('error', 'Academic year not found.');
            return res.redirect('/admin/academic-years');
        }

        year.yearName = yearName.trim();
        if (startDate) year.startDate = startDate;
        if (endDate) year.endDate = endDate;
        if (status) year.status = status;

        await year.save();

        if (year.status === 'active') {
             // Set all other years to inactive to maintain single source of truth
             await AcademicYear.updateMany(
                 { school: req.session.schoolId, _id: { $ne: year._id } },
                 { $set: { status: 'inactive' } }
             );
        }

        await ActivityLog.create({
            user: req.session.userId, school: req.session.schoolId,
            actionType: 'UPDATE_ACADEMIC_YEAR', entityType: 'AcademicYear',
            newValue: { yearName },
        });

        req.flash('success', `Academic Year "${year.yearName}" updated successfully.`);
        res.redirect('/admin/academic-years');
    } catch (err) {
        if (err.code === 11000) {
            req.flash('error', 'An academic year with that name already exists.');
        } else {
            req.flash('error', 'Failed to update academic year: ' + err.message);
        }
        res.redirect(`/admin/academic-years/${req.params.id}/edit`);
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

const postSetActiveAcademicYear = async (req, res) => {
    try {
        const { id } = req.params;
        const year = await AcademicYear.findOne({ _id: id, school: req.session.schoolId });
        if (!year) {
            req.flash('error', 'Academic year not found.');
            return res.redirect('/admin/academic-years');
        }

        // Set all other years to inactive
        await AcademicYear.updateMany(
            { school: req.session.schoolId, _id: { $ne: id } },
            { $set: { status: 'inactive' } }
        );

        // Set the requested year to active
        year.status = 'active';
        await year.save();

        req.flash('success', `Academic Year "${year.yearName}" is now set as the active current year.`);
        res.redirect('/admin/academic-years');
    } catch (err) {
        req.flash('error', 'Failed to set active year: ' + err.message);
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
            
        // Find all other sections in this academic year
        const occupiedSections = await ClassSection.find({ school: req.session.schoolId, academicYear: cls.academicYear });
        const occupiedTeacherIds = [];
        occupiedSections.forEach(sec => {
            // ONLY filter out primary class teachers (max 1 per year).
            // Do not filter out substituteTeachers (who can have infinite classes/can become CT).
            if (sec.classTeacher) occupiedTeacherIds.push(sec.classTeacher.toString());
        });

        const allTeachers = await User.find({ role: 'teacher', school: req.session.schoolId }).select('name email');
        const teachers = allTeachers.filter(t => !occupiedTeacherIds.includes(t._id.toString()));

        res.render('admin/classes/show', {
            title: `Class ${cls.className}`, layout: 'layouts/main',
            cls, sections, teachers,
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

        // Validate teacher constraints per Academic Year
        const ct = classTeacher ? classTeacher.toString().trim() : '';
        const st = substituteTeacher ? substituteTeacher.toString().trim() : '';
        
        if (ct || st) {
            if (ct) {
                const occupiedCt = await ClassSection.findOne({
                    school: req.session.schoolId,
                    academicYear: cls.academicYear,
                    classTeacher: ct
                });
                if (occupiedCt) {
                    req.flash('error', 'The selected class teacher is already assigned as a primary class teacher in another class for this academic year.');
                    return res.redirect(`/admin/classes/${classId}`);
                }
            }
            if (st) {
                const occupiedSt = await ClassSection.findOne({
                    school: req.session.schoolId,
                    academicYear: cls.academicYear,
                    classTeacher: st
                });
                if (occupiedSt) {
                    req.flash('error', 'The selected vice class teacher is a primary class teacher in another class (which prevents taking vice duties elsewhere).');
                    return res.redirect(`/admin/classes/${classId}`);
                }
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

        // Students in this section historically and currently
        const studentProfiles = await StudentProfile.find({ user: { $in: section.enrolledStudents || [] } })
            .populate('user', 'name email phone');

        // All students NOT yet in ANY section for THIS academic year (for assign dropdown)
        const yearSections = await ClassSection.find({ school: req.session.schoolId, academicYear: section.academicYear });
        const assignedStudentIds = [];
        yearSections.forEach(s => {
            if (s.enrolledStudents) assignedStudentIds.push(...s.enrolledStudents);
        });

        const unassignedProfiles = await StudentProfile.find({
            school: req.session.schoolId,
            user: { $nin: assignedStudentIds }
        }).populate('user', 'name email');

        // Filter out primary class teachers from OTHER sections in this academic year
        const occupiedSections = await ClassSection.find({ 
            school: req.session.schoolId, 
            academicYear: section.academicYear, 
            _id: { $ne: section._id } 
        });
        const occupiedTeacherIds = [];
        occupiedSections.forEach(sec => {
            if (sec.classTeacher) occupiedTeacherIds.push(sec.classTeacher.toString());
        });

        const allTeachers = await User.find({ role: 'teacher', school: req.session.schoolId }).select('name email');
        const teachers = allTeachers.filter(t => !occupiedTeacherIds.includes(t._id.toString()));

        // Check if timetable is generated
        const Timetable = require('../models/Timetable');
        const timetable = await Timetable.findOne({ section: section._id, academicYear: section.academicYear });

        res.render('admin/sections/show', {
            title: `Section ${section.sectionName}`, layout: 'layouts/main',
            section, studentProfiles, unassignedProfiles, teachers, timetable
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

        // Assign to new section without pulling from past years!
        // We enforce "one per year" by making the user remove them from the current year's section manually if they want to move them
        const yearSections = await ClassSection.find({ school: req.session.schoolId, academicYear: section.academicYear });
        const alreadyInYear = yearSections.some(s => s.enrolledStudents && s.enrolledStudents.includes(studentId));
        if (alreadyInYear) {
            req.flash('error', 'Student is already assigned to a section in this academic year! Please remove them from their current section first.');
            return res.redirect(`/admin/sections/${sectionId}`); 
        }

        profile.currentSection = sectionId;
        await profile.save();

        await ClassSection.findByIdAndUpdate(sectionId, { 
            $inc: { currentCount: 1 },
            $addToSet: { enrolledStudents: studentId }
        });

        // Record history
        await StudentSectionHistory.create({
            student: studentId,
            oldSection: null, // Initial manually assigned for this year
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
        
        await ClassSection.findByIdAndUpdate(sectionId, { 
            $inc: { currentCount: -1 },
            $pull: { enrolledStudents: studentId }
        });

        if (profile && profile.currentSection && profile.currentSection.toString() === sectionId) {
            profile.currentSection = null;
            await profile.save();
        }

        await StudentSectionHistory.create({
            student: studentId,
            oldSection: sectionId,
            newSection: null,
            transferReason: 'Removed from section by admin',
            transferredBy: req.session.userId,
        });
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
        const sectionToUpdate = await ClassSection.findOne({ _id: sectionId, school: req.session.schoolId });
        if (!sectionToUpdate) return res.redirect('/admin/classes');

        const ct = classTeacher ? classTeacher.toString().trim() : '';
        const st = substituteTeacher ? substituteTeacher.toString().trim() : '';

        // Validate teacher constraints per Academic Year
        if (ct || st) {
            if (ct) {
                const occupiedCt = await ClassSection.findOne({
                    school: req.session.schoolId,
                    academicYear: sectionToUpdate.academicYear,
                    _id: { $ne: sectionId },
                    classTeacher: ct
                });
                if (occupiedCt) {
                    req.flash('error', 'The selected class teacher is already assigned as a primary class teacher in another class for this academic year.');
                    return res.redirect(`/admin/sections/${sectionId}`);
                }
            }
            if (st) {
                const occupiedSt = await ClassSection.findOne({
                    school: req.session.schoolId,
                    academicYear: sectionToUpdate.academicYear,
                    _id: { $ne: sectionId },
                    classTeacher: st
                });
                if (occupiedSt) {
                    req.flash('error', 'The selected vice class teacher is a primary class teacher in another class (which prevents taking vice duties elsewhere).');
                    return res.redirect(`/admin/sections/${sectionId}`);
                }
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

const postAutoAssignStudents = async (req, res) => {
    try {
        const { year } = req.body;
        if (!year) {
            req.flash('error', 'No academic year selected.');
            return res.redirect('/admin/classes');
        }

        const availableClasses = await Class.find({ school: req.session.schoolId, academicYear: year });
        const availableSections = await ClassSection.find({ school: req.session.schoolId, academicYear: year });

        // Fetch students belonging to the school that have class string set
        const students = await StudentProfile.find({ school: req.session.schoolId, class: { $ne: '' } })
            .populate('currentSection');

        // Pre-compute all assigned students in this academic year from the new authority source
        const alreadyAssignedStudentIds = new Set();
        availableSections.forEach(s => {
            if (s.enrolledStudents) {
                s.enrolledStudents.forEach(id => alreadyAssignedStudentIds.add(id.toString()));
            }
        });

        let assignedCount = 0;

        for (const st of students) {
            // "In every academic year a student can assign once"
            // Skip students who are already tracked in ANY section's array within THIS academic year
            if (st.user && alreadyAssignedStudentIds.has(st.user.toString())) {
                continue;
            }

            const parsedNum = parseInt(st.class);
            const isNum = !isNaN(parsedNum);
            const sClassStr = st.class.toString().trim().toLowerCase();
            const sSectionStr = st.section ? st.section.toString().trim().toLowerCase() : '';

            const foundClass = availableClasses.find(c => 
                c.className.toLowerCase() === sClassStr || 
                (isNum && c.classNumber === parsedNum)
            );

            if (foundClass) {
                const foundSec = availableSections.find(s => 
                    s.class.toString() === foundClass._id.toString() &&
                    s.sectionName.toLowerCase() === sSectionStr
                );

                if (foundSec && foundSec.currentCount < foundSec.maxStudents) {
                    let oldSectionId = st.currentSection ? st.currentSection._id : null;
                    
                    // Directly use findByIdAndUpdate to bypass pre-save hook anomalies that can arise from population
                    await StudentProfile.findByIdAndUpdate(st._id, { currentSection: foundSec._id });

                    if (oldSectionId) {
                        const oldSecObj = await ClassSection.findById(oldSectionId);
                        if (oldSecObj && oldSecObj.academicYear && oldSecObj.academicYear.toString() === year.toString()) {
                            // Student is leaving a section within THIS same year
                            await ClassSection.findByIdAndUpdate(oldSectionId, { 
                                $inc: { currentCount: -1 },
                                $pull: { enrolledStudents: st._id }
                            });
                        } else {
                            // Boundary crossed! Do not pull or decrement from the old year!
                            // Just null out oldSectionId so history log makes sense
                            oldSectionId = null;
                        }
                    }

                    const updatedSec = await ClassSection.findByIdAndUpdate(foundSec._id, { 
                        $addToSet: { enrolledStudents: st.user }
                    }, { new: true });
                    
                    if (updatedSec) {
                        updatedSec.currentCount = updatedSec.enrolledStudents.length;
                        await updatedSec.save();
                    }
                    
                    if (st.user) {
                        await StudentSectionHistory.create({
                            student: st.user,
                            oldSection: oldSectionId,
                            newSection: foundSec._id,
                            transferReason: 'Auto-assigned by admin',
                            transferredBy: req.session.userId
                        });
                    }

                    foundSec.currentCount++; // update in memory for next capacity check
                    assignedCount++;
                }
            }
        }

        if (assignedCount > 0) {
            req.flash('success', `Successfully auto-assigned ${assignedCount} students for this academic year.`);
        } else {
            req.flash('success', `No students were newly assigned (students may already be assigned or class strings mismatch).`);
        }
        res.redirect(`/admin/classes?year=${year}`);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to auto-assign students: ' + err.message);
        res.redirect('/admin/classes');
    }
};

module.exports = {
    // Academic years
    getAcademicYears, postCreateAcademicYear, getEditAcademicYear, postEditAcademicYear, postDeleteAcademicYear, postSetActiveAcademicYear,
    // Classes
    getClasses, getCreateClass, postCreateClass, getClassDetail, postDeleteClass, postAutoAssignStudents,
    // Sections
    postCreateSection, getSectionDetail,
    postAssignStudentToSection, postRemoveStudentFromSection,
    postUpdateSectionTeacher, postUpdateSectionCapacity, postDeleteSection,
};
