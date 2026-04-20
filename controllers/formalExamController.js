const FormalExam      = require('../models/FormalExam');
const ExamMarksSheet  = require('../models/ExamMarksSheet');
const FormalResult    = require('../models/FormalResult');
const ClassSection    = require('../models/ClassSection');
const AcademicYear    = require('../models/AcademicYear');
const Subject         = require('../models/Subject');
const SectionSubjectTeacher = require('../models/SectionSubjectTeacher');
const StudentProfile  = require('../models/StudentProfile');
const AttendanceRecord = require('../models/AttendanceRecord');
const User            = require('../models/User');

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Fills assignedTeachers array for legacy exam docs that only have assignedTeacher (single)
async function enrichExamTeachers(exam) {
    const sectionId = exam.section._id || exam.section;
    for (const sc of exam.subjects) {
        if (!sc.assignedTeachers || sc.assignedTeachers.length === 0) {
            const subjectId = sc.subject._id || sc.subject;
            const ssts = await SectionSubjectTeacher.find({ section: sectionId, subject: subjectId })
                .populate('teacher', 'name').lean();
            sc.assignedTeachers = ssts.map(s => s.teacher).filter(Boolean);
        }
    }
}

function calcGrade(percentage) {
    if (percentage >= 90) return 'A+';
    if (percentage >= 80) return 'A';
    if (percentage >= 70) return 'B+';
    if (percentage >= 60) return 'B';
    if (percentage >= 50) return 'C';
    if (percentage >= 40) return 'D';
    return 'F';
}

async function getAttendancePercent(studentId, sectionId) {
    try {
        const Attendance = require('../models/Attendance');
        const sessions = await Attendance.find({ section: sectionId }, '_id');
        const sessionIds = sessions.map(s => s._id);
        if (!sessionIds.length) return null;
        const records = await AttendanceRecord.find({ attendance: { $in: sessionIds }, student: studentId });
        if (!records.length) return null;
        const present = records.filter(r => r.status === 'Present').length;
        return Math.round((present / records.length) * 100);
    } catch {
        return null;
    }
}

async function generateFormalResults(exam) {
    const section = await ClassSection.findById(exam.section).populate('enrolledStudents');
    const students = section.enrolledStudents || [];
    const sheets   = await ExamMarksSheet.find({ exam: exam._id });

    // Build result per student
    const studentResults = [];
    for (const studentUser of students) {
        const subResults = [];
        let totalObtained = 0;
        let totalMax = 0;
        let allPassed = true;

        for (const subConf of exam.subjects) {
            const sheet = sheets.find(s => String(s.subject) === String(subConf.subject));
            const entry = sheet ? sheet.entries.find(e => String(e.student) === String(studentUser._id)) : null;

            const isAbsent = entry ? entry.isAbsent : false;
            const marks    = (entry && !isAbsent) ? (entry.marksObtained || 0) : 0;
            const pct      = subConf.maxMarks > 0 ? (marks / subConf.maxMarks) * 100 : 0;
            const grade    = isAbsent ? 'AB' : calcGrade(pct);
            const passed   = !isAbsent && marks >= subConf.passingMarks;

            if (!passed) allPassed = false;

            subResults.push({
                subject:       subConf.subject,
                marksObtained: marks,
                maxMarks:      subConf.maxMarks,
                passingMarks:  subConf.passingMarks,
                grade,
                isPassed:      passed,
                isAbsent,
                remarks:       entry ? (entry.remarks || '') : '',
            });

            totalObtained += marks;
            totalMax      += subConf.maxMarks;
        }

        const percentage = totalMax > 0 ? Math.round((totalObtained / totalMax) * 100 * 100) / 100 : 0;
        const grade      = calcGrade(percentage);
        const attendance = await getAttendancePercent(studentUser._id, exam.section);

        studentResults.push({
            studentUser,
            subResults,
            totalObtained,
            totalMax,
            percentage,
            grade,
            isPassed: allPassed,
            attendance,
        });
    }

    // Rank by percentage descending
    studentResults.sort((a, b) => b.percentage - a.percentage);

    // Upsert results
    for (let i = 0; i < studentResults.length; i++) {
        const sr = studentResults[i];
        await FormalResult.findOneAndUpdate(
            { exam: exam._id, student: sr.studentUser._id },
            {
                exam:         exam._id,
                student:      sr.studentUser._id,
                school:       exam.school,
                section:      exam.section,
                academicYear: exam.academicYear,
                subjects:     sr.subResults,
                totalMarks:   sr.totalObtained,
                totalMaxMarks:sr.totalMax,
                percentage:   sr.percentage,
                grade:        sr.grade,
                rank:         i + 1,
                isPassed:     sr.isPassed,
                attendancePercentage: sr.attendance,
                generatedAt:  new Date(),
            },
            { upsert: true, new: true }
        );
    }
}

// ─── ADMIN CONTROLLERS ────────────────────────────────────────────────────────

// GET /admin/results/exams
exports.adminGetExams = async (req, res) => {
    try {
        const school = req.user.school._id;
        const { academicYearId, sectionId } = req.query;

        const filter = { school };
        if (academicYearId) filter.academicYear = academicYearId;
        if (sectionId)      filter.section = sectionId;

        const academicYears = await AcademicYear.find({ school }).sort({ createdAt: -1 });
        const currentAY = academicYears.find(y => y.status === 'active') || academicYears[0];

        // Sections filter dropdown: only current academic year, sorted Class 1-A style
        let sections = await ClassSection.find({ school, status: 'active', ...(currentAY ? { academicYear: currentAY._id } : {}) })
            .populate('class', 'className classNumber')
            .lean();
        sections.sort((a, b) => (a.class?.classNumber - b.class?.classNumber) || a.sectionName.localeCompare(b.sectionName));

        const exams = await FormalExam.find(filter)
            .populate({ path: 'section', populate: { path: 'class', select: 'className classNumber' } })
            .populate('academicYear', 'yearName')
            .populate('createdBy', 'name')
            .sort({ createdAt: -1 });

        res.render('admin/results/exams/index', {
            title: 'Formal Exams',
            layout: 'layouts/main',
            exams, academicYears, sections,
            selectedAcademicYear: academicYearId || '',
            selectedSection: sectionId || '',
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load exams.');
        res.redirect('/admin/dashboard');
    }
};

// GET /admin/results/exams/create
exports.adminGetCreateExam = async (req, res) => {
    try {
        const school = req.user.school._id;
        const academicYears = await AcademicYear.find({ school, status: 'active' }).sort({ createdAt: -1 });
        const currentAcademicYear = academicYears[0] || null;

        let sections = [];
        if (currentAcademicYear) {
            sections = await ClassSection.find({ school, status: 'active', academicYear: currentAcademicYear._id })
                .populate('class', 'className classNumber')
                .lean();
            sections.sort((a, b) => (a.class?.classNumber - b.class?.classNumber) || a.sectionName.localeCompare(b.sectionName));
        }

        res.render('admin/results/exams/create', {
            title: 'Create Formal Exam',
            layout: 'layouts/main',
            academicYears, sections, currentAcademicYear,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load form data.');
        res.redirect('/admin/results/exams');
    }
};

// POST /admin/results/exams/create
exports.adminPostCreateExam = async (req, res) => {
    try {
        const school = req.user.school._id;
        const { title, examType, academicYearId, sectionId, startDate, endDate, publishDate, subjects } = req.body;

        // Backend date validations
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const start = new Date(startDate);
        const end   = new Date(endDate);
        if (start < today) {
            req.flash('error', 'Exam start date cannot be in the past.');
            return res.redirect('/admin/results/exams/create');
        }
        if (end < start) {
            req.flash('error', 'Exam end date must be on or after the start date.');
            return res.redirect('/admin/results/exams/create');
        }
        if (publishDate) {
            const pub = new Date(publishDate);
            if (pub <= end) {
                req.flash('error', 'Publish date must be after the exam end date.');
                return res.redirect('/admin/results/exams/create');
            }
        }

        // subjects arrives as array of {subjectId, maxMarks, passingMarks, examDate, startTime, endTime, order}
        // body-parser may produce an object with numeric keys when only 1 item is sent
        let subjectArr = subjects;
        if (!subjectArr) {
            subjectArr = [];
        } else if (!Array.isArray(subjectArr)) {
            subjectArr = Object.values(subjectArr);
        }
        subjectArr = subjectArr.filter(Boolean);

        if (subjectArr.length === 0) {
            req.flash('error', 'Please select at least one subject.');
            return res.redirect('/admin/results/exams/create');
        }

        // Backend per-subject date & time validation
        for (const s of subjectArr) {
            if (s.examDate) {
                const sDate = new Date(s.examDate);
                if (sDate < start) {
                    req.flash('error', 'A subject exam date cannot be before the exam start date.');
                    return res.redirect('/admin/results/exams/create');
                }
                if (sDate > end) {
                    req.flash('error', 'A subject exam date cannot be after the exam end date.');
                    return res.redirect('/admin/results/exams/create');
                }
            }
            if (!s.startTime || !s.endTime) {
                req.flash('error', 'Start time and end time are required for every subject.');
                return res.redirect('/admin/results/exams/create');
            }
            if (s.endTime <= s.startTime) {
                req.flash('error', 'End time must be after start time for each subject.');
                return res.redirect('/admin/results/exams/create');
            }
        }

        // Resolve assigned teachers from SectionSubjectTeacher
        const subjectConfigs = await Promise.all(subjectArr.map(async (s, idx) => {
            const ssts = await SectionSubjectTeacher.find({ section: sectionId, subject: s.subjectId });
            return {
                subject:          s.subjectId,
                maxMarks:         parseInt(s.maxMarks),
                passingMarks:     parseInt(s.passingMarks),
                assignedTeachers: ssts.map(t => t.teacher).filter(Boolean),
                examDate:         s.examDate ? new Date(s.examDate) : null,
                startTime:        s.startTime || '',
                endTime:          s.endTime   || '',
                order:            parseInt(s.order ?? idx),
            };
        }));

        // Sort by order
        subjectConfigs.sort((a, b) => a.order - b.order);

        const exam = new FormalExam({
            school,
            academicYear: academicYearId,
            section:      sectionId,
            title,
            examType,
            subjects:     subjectConfigs,
            startDate:    start,
            endDate:      end,
            publishDate:  publishDate ? new Date(publishDate) : null,
            status:       'MARKS_PENDING',
            createdBy:    req.user._id,
            auditLog: [{ action: 'CREATED', by: req.user._id, notes: `Exam created` }],
        });
        await exam.save();

        // Initialize empty marks sheets per subject
        const section = await ClassSection.findById(sectionId);
        const studentIds = section.enrolledStudents || [];

        for (const sc of subjectConfigs) {
            const entries = studentIds.map(sid => ({ student: sid, marksObtained: null, isAbsent: false, remarks: '' }));
            await ExamMarksSheet.create({
                exam: exam._id,
                subject: sc.subject,
                section: sectionId,
                entries,
            });
        }

        req.flash('success', 'Exam created successfully.');
        res.redirect('/admin/results/exams');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to create exam: ' + err.message);
        res.redirect('/admin/results/exams/create');
    }
};

// POST /admin/results/exams/:id/delete
exports.adminDeleteExam = async (req, res) => {
    try {
        const school = req.user.school._id;
        const exam = await FormalExam.findOne({ _id: req.params.id, school });
        if (!exam) { req.flash('error', 'Exam not found.'); return res.redirect('/admin/results/exams'); }

        await Promise.all([
            ExamMarksSheet.deleteMany({ exam: exam._id }),
            FormalResult.deleteMany({ exam: exam._id }),
            FormalExam.deleteOne({ _id: exam._id }),
        ]);

        req.flash('success', `Exam "${exam.title}" deleted successfully.`);
        res.redirect('/admin/results/exams');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to delete exam: ' + err.message);
        res.redirect('/admin/results/exams');
    }
};

// GET /admin/results/exams/:id/edit
exports.adminGetEditExam = async (req, res) => {
    try {
        const school = req.user.school._id;
        const exam = await FormalExam.findOne({ _id: req.params.id, school })
            .populate('section', 'sectionName class')
            .populate({ path: 'section', populate: { path: 'class', select: 'className' } })
            .populate('academicYear', 'yearName')
            .populate('subjects.subject', 'subjectName');

        if (!exam) { req.flash('error', 'Exam not found.'); return res.redirect('/admin/results/exams'); }

        const now = new Date(); now.setHours(0, 0, 0, 0);
        if (new Date(exam.startDate) <= now) {
            req.flash('error', 'Exam has already started and cannot be edited.');
            return res.redirect(`/admin/results/exams/${exam._id}`);
        }

        const [ssts, currentAcademicYear] = await Promise.all([
            SectionSubjectTeacher.find({ section: exam.section })
                .populate('subject', 'subjectName')
                .populate('teacher', 'name')
                .lean(),
            AcademicYear.findById(exam.academicYear),
        ]);

        // Group by subject — one entry per subject with all teachers
        const subjectMap = {};
        for (const s of ssts) {
            if (!s.subject) continue;
            const id = String(s.subject._id);
            if (!subjectMap[id]) subjectMap[id] = { subjectId: s.subject._id, subjectName: s.subject.subjectName, teachers: [] };
            if (s.teacher) subjectMap[id].teachers.push(s.teacher.name);
        }
        const sectionSubjects = Object.values(subjectMap)
            .sort((a, b) => a.subjectName.localeCompare(b.subjectName));

        res.render('admin/results/exams/edit', {
            title: `Edit Exam — ${exam.title}`,
            layout: 'layouts/main',
            exam, sectionSubjects, currentAcademicYear,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load exam.');
        res.redirect('/admin/results/exams');
    }
};

// POST /admin/results/exams/:id/edit
exports.adminPostEditExam = async (req, res) => {
    const redirectEdit = `/admin/results/exams/${req.params.id}/edit`;
    try {
        const school = req.user.school._id;
        const exam = await FormalExam.findOne({ _id: req.params.id, school });
        if (!exam) { req.flash('error', 'Exam not found.'); return res.redirect('/admin/results/exams'); }

        const now = new Date(); now.setHours(0, 0, 0, 0);
        if (new Date(exam.startDate) <= now) {
            req.flash('error', 'Exam has already started and cannot be edited.');
            return res.redirect(`/admin/results/exams/${exam._id}`);
        }

        const { title, examType, startDate, endDate, publishDate, subjects } = req.body;

        const start = new Date(startDate);
        const end   = new Date(endDate);
        if (start < now)      { req.flash('error', 'Start date cannot be in the past.'); return res.redirect(redirectEdit); }
        if (end < start)      { req.flash('error', 'End date must be on or after start date.'); return res.redirect(redirectEdit); }
        if (publishDate) {
            const pub = new Date(publishDate);
            if (pub <= end)   { req.flash('error', 'Publish date must be after exam end date.'); return res.redirect(redirectEdit); }
        }

        let subjectArr = subjects;
        if (!subjectArr)                    { subjectArr = []; }
        else if (!Array.isArray(subjectArr)){ subjectArr = Object.values(subjectArr); }
        subjectArr = subjectArr.filter(Boolean);

        if (subjectArr.length === 0) { req.flash('error', 'Please select at least one subject.'); return res.redirect(redirectEdit); }

        for (const s of subjectArr) {
            if (s.examDate) {
                const d = new Date(s.examDate);
                if (d < start || d > end) { req.flash('error', 'A subject exam date must be within the exam start and end dates.'); return res.redirect(redirectEdit); }
            }
            if (!s.startTime || !s.endTime) { req.flash('error', 'Start time and end time are required for every subject.'); return res.redirect(redirectEdit); }
            if (s.endTime <= s.startTime)   { req.flash('error', 'End time must be after start time for each subject.'); return res.redirect(redirectEdit); }
        }

        const subjectConfigs = await Promise.all(subjectArr.map(async (s, idx) => {
            const ssts = await SectionSubjectTeacher.find({ section: exam.section, subject: s.subjectId });
            return {
                subject:          s.subjectId,
                maxMarks:         parseInt(s.maxMarks),
                passingMarks:     parseInt(s.passingMarks),
                assignedTeachers: ssts.map(t => t.teacher).filter(Boolean),
                examDate:         s.examDate ? new Date(s.examDate) : null,
                startTime:        s.startTime || '',
                endTime:          s.endTime   || '',
                order:            parseInt(s.order ?? idx),
            };
        }));
        subjectConfigs.sort((a, b) => a.order - b.order);

        // Sync marks sheets: add missing, remove dropped
        const newSubjectIds  = subjectConfigs.map(s => String(s.subject));
        const existingSheets = await ExamMarksSheet.find({ exam: exam._id });
        const existingIds    = existingSheets.map(s => String(s.subject));

        // Delete sheets for removed subjects
        const toRemove = existingIds.filter(id => !newSubjectIds.includes(id));
        if (toRemove.length) await ExamMarksSheet.deleteMany({ exam: exam._id, subject: { $in: toRemove } });

        // Create sheets for new subjects
        const section    = await ClassSection.findById(exam.section);
        const studentIds = section.enrolledStudents || [];
        for (const sc of subjectConfigs) {
            if (!existingIds.includes(String(sc.subject))) {
                const entries = studentIds.map(sid => ({ student: sid, marksObtained: null, isAbsent: false, remarks: '' }));
                await ExamMarksSheet.create({ exam: exam._id, subject: sc.subject, section: exam.section, entries });
            }
        }

        exam.title       = title;
        exam.examType    = examType;
        exam.startDate   = start;
        exam.endDate     = end;
        exam.publishDate = publishDate ? new Date(publishDate) : null;
        exam.subjects    = subjectConfigs;
        exam.auditLog.push({ action: 'EDITED', by: req.user._id, notes: 'Exam details updated by admin' });
        await exam.save();

        req.flash('success', 'Exam updated successfully.');
        res.redirect(`/admin/results/exams/${exam._id}`);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to update exam: ' + err.message);
        res.redirect(redirectEdit);
    }
};

// GET /admin/results/exams/:id
exports.adminGetExamDetail = async (req, res) => {
    try {
        const exam = await FormalExam.findById(req.params.id)
            .populate('section')
            .populate({ path: 'section', populate: { path: 'class', select: 'className classNumber' } })
            .populate('academicYear', 'yearName')
            .populate('subjects.subject', 'subjectName subjectCode')
            .populate('subjects.assignedTeachers', 'name')
            .populate('createdBy', 'name')
            .populate('classApprovedBy', 'name')
            .populate('finalApprovedBy', 'name');

        if (!exam || String(exam.school) !== String(req.user.school._id)) {
            req.flash('error', 'Exam not found.');
            return res.redirect('/admin/results/exams');
        }

        await enrichExamTeachers(exam);

        const sheets = await ExamMarksSheet.find({ exam: exam._id })
            .populate('submittedBy', 'name')
            .populate('subject', 'subjectName');

        const results = await FormalResult.find({ exam: exam._id })
            .populate('student', 'name')
            .populate('subjects.subject', 'subjectName')
            .sort({ rank: 1 });

        res.render('admin/results/exams/detail', {
            title: `Exam: ${exam.title}`,
            layout: 'layouts/main',
            exam, sheets, results,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load exam.');
        res.redirect('/admin/results/exams');
    }
};

// GET /admin/results/exams/:id/marks-review
exports.adminGetMarksReview = async (req, res) => {
    try {
        const exam = await FormalExam.findById(req.params.id)
            .populate('subjects.subject', 'subjectName subjectCode')
            .populate('subjects.assignedTeachers', 'name');

        if (!exam || String(exam.school) !== String(req.user.school._id)) {
            req.flash('error', 'Exam not found.');
            return res.redirect('/admin/results/exams');
        }

        const sheets = await ExamMarksSheet.find({ exam: exam._id })
            .populate('subject', 'subjectName')
            .populate('entries.student', 'name');

        const students = await User.find({ _id: { $in: (await ClassSection.findById(exam.section)).enrolledStudents } }, 'name');

        res.render('admin/results/exams/marks-review', {
            title: `Marks Review: ${exam.title}`,
            layout: 'layouts/main',
            exam, sheets, students,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load marks review.');
        res.redirect('/admin/results/exams');
    }
};

// POST /admin/results/exams/:id/approve  (FINAL_APPROVED)
exports.adminPostApproveExam = async (req, res) => {
    try {
        const exam = await FormalExam.findById(req.params.id);
        if (!exam || String(exam.school) !== String(req.user.school._id)) {
            req.flash('error', 'Exam not found.');
            return res.redirect('/admin/results/exams');
        }
        if (exam.status !== 'CLASS_APPROVED') {
            req.flash('error', 'Exam must be CLASS_APPROVED before final approval.');
            return res.redirect(`/admin/results/exams/${exam._id}`);
        }

        exam.status = 'FINAL_APPROVED';
        exam.finalApprovedBy = req.user._id;
        exam.finalApprovedAt = new Date();
        exam.auditLog.push({ action: 'FINAL_APPROVED', by: req.user._id, notes: req.body.notes || '' });
        await exam.save();

        // Generate results
        await generateFormalResults(exam);
        exam.resultsGenerated = true;
        await exam.save();

        req.flash('success', 'Exam approved and results generated.');
        res.redirect(`/admin/results/exams/${exam._id}`);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to approve exam: ' + err.message);
        res.redirect(`/admin/results/exams/${req.params.id}`);
    }
};

// POST /admin/results/exams/:id/reject
exports.adminPostRejectExam = async (req, res) => {
    try {
        const exam = await FormalExam.findById(req.params.id);
        if (!exam || String(exam.school) !== String(req.user.school._id)) {
            req.flash('error', 'Exam not found.');
            return res.redirect('/admin/results/exams');
        }
        if (!['CLASS_APPROVED', 'SUBMITTED'].includes(exam.status)) {
            req.flash('error', 'Cannot reject at this stage.');
            return res.redirect(`/admin/results/exams/${exam._id}`);
        }

        exam.status = 'REJECTED';
        exam.rejectionReason = req.body.reason || '';
        exam.auditLog.push({ action: 'REJECTED_BY_ADMIN', by: req.user._id, notes: req.body.reason || '' });
        await exam.save();

        req.flash('success', 'Exam rejected.');
        res.redirect(`/admin/results/exams/${exam._id}`);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to reject exam.');
        res.redirect(`/admin/results/exams/${req.params.id}`);
    }
};

// POST /admin/results/exams/:id/reopen
exports.adminPostReopenExam = async (req, res) => {
    try {
        const exam = await FormalExam.findById(req.params.id);
        if (!exam || String(exam.school) !== String(req.user.school._id)) {
            req.flash('error', 'Exam not found.');
            return res.redirect('/admin/results/exams');
        }
        if (exam.status !== 'FINAL_APPROVED') {
            req.flash('error', 'Only FINAL_APPROVED exams can be reopened.');
            return res.redirect(`/admin/results/exams/${exam._id}`);
        }

        exam.status = 'REOPENED';
        exam.resultsGenerated = false;
        exam.classApprovedBy = null;
        exam.classApprovedAt = null;
        exam.finalApprovedBy = null;
        exam.finalApprovedAt = null;
        exam.auditLog.push({ action: 'REOPENED', by: req.user._id, notes: req.body.reason || '' });

        // Reset all marks sheets to DRAFT
        await ExamMarksSheet.updateMany({ exam: exam._id }, { status: 'DRAFT', submittedBy: null, submittedAt: null });
        await exam.save();

        req.flash('success', 'Exam reopened for correction.');
        res.redirect(`/admin/results/exams/${exam._id}`);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to reopen exam.');
        res.redirect(`/admin/results/exams/${req.params.id}`);
    }
};

// POST /admin/results/exams/:id/marks/:subjectId  (admin override marks)
exports.adminPostEditMarks = async (req, res) => {
    try {
        const exam = await FormalExam.findById(req.params.id);
        if (!exam || String(exam.school) !== String(req.user.school._id)) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        if (exam.status === 'FINAL_APPROVED') {
            return res.status(400).json({ error: 'Exam is locked. Reopen first.' });
        }

        const sheet = await ExamMarksSheet.findOne({ exam: exam._id, subject: req.params.subjectId });
        if (!sheet) return res.status(404).json({ error: 'Sheet not found' });

        const { entries } = req.body; // [{studentId, marks, isAbsent, remarks}]
        const prevEntries = JSON.parse(JSON.stringify(sheet.entries));

        sheet.entries = entries.map(e => ({
            student:       e.studentId,
            marksObtained: e.isAbsent ? null : parseFloat(e.marks),
            isAbsent:      !!e.isAbsent,
            remarks:       e.remarks || '',
        }));
        sheet.auditLog.push({ action: 'ADMIN_EDIT', by: req.user._id, notes: 'Admin override', changes: { prev: prevEntries } });
        await sheet.save();

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

// GET /admin/results/exams/:id/result
exports.adminGetResult = async (req, res) => {
    try {
        const exam = await FormalExam.findById(req.params.id)
            .populate('section')
            .populate({ path: 'section', populate: { path: 'class', select: 'className' } })
            .populate('academicYear', 'yearName')
            .populate('subjects.subject', 'subjectName');

        if (!exam || String(exam.school) !== String(req.user.school._id)) {
            req.flash('error', 'Exam not found.');
            return res.redirect('/admin/results/exams');
        }

        const results = await FormalResult.find({ exam: exam._id })
            .populate('student', 'name')
            .populate('subjects.subject', 'subjectName')
            .sort({ rank: 1 });

        res.render('admin/results/exams/result', {
            title: `Results: ${exam.title}`,
            layout: 'layouts/main',
            exam, results,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load results.');
        res.redirect('/admin/results/exams');
    }
};

// ─── API: get section's subjects with assigned teachers (for create form) ─────
exports.adminApiSectionSubjects = async (req, res) => {
    try {
        const { sectionId } = req.params;
        const ssts = await SectionSubjectTeacher.find({ section: sectionId })
            .populate('subject', 'subjectName')
            .populate('teacher', 'name')
            .lean();

        // Group by subject — one entry per subject, all teachers combined
        const map = {};
        for (const s of ssts) {
            if (!s.subject) continue;
            const id = String(s.subject._id);
            if (!map[id]) {
                map[id] = { subjectId: s.subject._id, subjectName: s.subject.subjectName, teachers: [] };
            }
            if (s.teacher) map[id].teachers.push(s.teacher.name);
        }

        const result = Object.values(map)
            .map(s => ({
                subjectId:   s.subjectId,
                subjectName: s.subjectName,
                teacherName: s.teachers.length ? s.teachers.join(', ') : '—',
            }))
            .sort((a, b) => a.subjectName.localeCompare(b.subjectName));

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── TEACHER CONTROLLERS ──────────────────────────────────────────────────────

// GET /teacher/results/marks-entry  — list exams assigned to this teacher
exports.teacherGetMarksEntry = async (req, res) => {
    try {
        const teacherId = req.user._id;

        // Find sections where this teacher teaches a subject
        const ssts = await SectionSubjectTeacher.find({ teacher: teacherId }).populate('section subject');

        // Find active exams for those sections
        const sectionIds = ssts.map(s => s.section._id);
        const exams = await FormalExam.find({
            section: { $in: sectionIds },
            status: { $in: ['MARKS_PENDING', 'SUBMITTED', 'REJECTED', 'REOPENED', 'CLASS_APPROVED', 'FINAL_APPROVED'] },
        })
            .populate('section')
            .populate({ path: 'section', populate: { path: 'class', select: 'className classNumber' } })
            .populate('academicYear', 'yearName')
            .populate('subjects.subject', 'subjectName')
            .sort({ createdAt: -1 });

        // Enrich teachers for legacy docs
        for (const exam of exams) await enrichExamTeachers(exam);

        // Load all sheets for these exams to get per-subject status
        const examIds = exams.map(e => e._id);
        const allSheets = await ExamMarksSheet.find({ exam: { $in: examIds } }).lean();

        const enrichedExams = exams.map(exam => {
            const mySubjects = exam.subjects
                .filter(sc => sc.assignedTeachers?.some(t => String(t?._id || t) === String(teacherId)))
                .map(sc => {
                    const subId = String(sc.subject?._id || sc.subject);
                    const sheet = allSheets.find(s => String(s.exam) === String(exam._id) && String(s.subject) === subId);
                    const scObj = sc.toObject ? sc.toObject() : { ...sc };
                    scObj.sheetStatus = sheet ? sheet.status : 'DRAFT';
                    return scObj;
                });
            return { exam, mySubjects };
        }).filter(e => e.mySubjects.length > 0);

        res.render('teacher/results/marks-entry', {
            title: 'Marks Entry',
            layout: 'layouts/main',
            enrichedExams,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load marks entry.');
        res.redirect('/teacher/dashboard');
    }
};

// GET /teacher/results/marks-entry/:examId/:subjectId
exports.teacherGetMarksForm = async (req, res) => {
    try {
        const { examId, subjectId } = req.params;
        const teacherId = req.user._id;

        const exam = await FormalExam.findById(examId)
            .populate('subjects.subject', 'subjectName subjectCode')
            .populate('subjects.assignedTeachers', 'name')
            .populate('section');

        if (!exam) {
            req.flash('error', 'Exam not found.');
            return res.redirect('/teacher/results/marks-entry');
        }

        await enrichExamTeachers(exam);
        const subConf = exam.subjects.find(s => String(s.subject._id) === String(subjectId) && s.assignedTeachers?.some(t => String(t?._id || t) === String(teacherId)));
        if (!subConf) {
            req.flash('error', 'Not authorized for this subject.');
            return res.redirect('/teacher/results/marks-entry');
        }

        const sheet = await ExamMarksSheet.findOne({ exam: examId, subject: subjectId }).populate('entries.student', 'name');
        const students = await User.find({ _id: { $in: (await ClassSection.findById(exam.section._id)).enrolledStudents } }, 'name').sort({ name: 1 });

        // Merge student list with sheet entries
        const entries = students.map(st => {
            const entry = sheet ? sheet.entries.find(e => String(e.student._id || e.student) === String(st._id)) : null;
            return {
                studentId: st._id,
                studentName: st.name,
                marksObtained: entry ? entry.marksObtained : null,
                isAbsent: entry ? entry.isAbsent : false,
                remarks: entry ? entry.remarks : '',
            };
        });

        const isReadOnly = (sheet && sheet.status === 'SUBMITTED') ||
                           ['CLASS_APPROVED', 'FINAL_APPROVED'].includes(exam.status);

        res.render('teacher/results/marks-form', {
            title: `Enter Marks: ${subConf.subject.subjectName}`,
            layout: 'layouts/main',
            exam, subConf, sheet, entries, isReadOnly,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load marks form.');
        res.redirect('/teacher/results/marks-entry');
    }
};

// POST /teacher/results/marks-entry/:examId/:subjectId/save
exports.teacherPostSaveMarks = async (req, res) => {
    try {
        const { examId, subjectId } = req.params;
        const teacherId = req.user._id;
        const { entries, submitFlag: submit } = req.body;

        const exam = await FormalExam.findById(examId);
        if (!exam || exam.status === 'FINAL_APPROVED') {
            req.flash('error', 'Exam is locked.');
            return res.redirect('/teacher/results/marks-entry');
        }

        await enrichExamTeachers(exam);
        const subConf = exam.subjects.find(s => String(s.subject) === String(subjectId) && s.assignedTeachers?.some(t => String(t?._id || t) === String(teacherId)));
        if (!subConf) {
            req.flash('error', 'Not authorized.');
            return res.redirect('/teacher/results/marks-entry');
        }

        const sheet = await ExamMarksSheet.findOne({ exam: examId, subject: subjectId });
        if (!sheet) {
            req.flash('error', 'Marks sheet not found.');
            return res.redirect('/teacher/results/marks-entry');
        }

        if (sheet.status === 'SUBMITTED') {
            req.flash('error', 'Marks already submitted. Contact class teacher to reject if corrections are needed.');
            return res.redirect('/teacher/results/marks-entry');
        }

        const entryArr = Array.isArray(entries) ? entries : [entries];

        // Validate marks don't exceed max
        for (const e of entryArr) {
            if (e.isAbsent !== 'on') {
                const m = parseFloat(e.marks);
                if (!isNaN(m) && m > subConf.maxMarks) {
                    req.flash('error', `Marks cannot exceed the maximum (${subConf.maxMarks}).`);
                    return res.redirect(`/teacher/results/marks-entry/${examId}/${subjectId}`);
                }
                if (!isNaN(m) && m < 0) {
                    req.flash('error', 'Marks cannot be negative.');
                    return res.redirect(`/teacher/results/marks-entry/${examId}/${subjectId}`);
                }
            }
        }

        sheet.entries = entryArr.map(e => ({
            student:       e.studentId,
            marksObtained: e.isAbsent === 'on' ? null : parseFloat(e.marks),
            isAbsent:      e.isAbsent === 'on',
            remarks:       e.remarks || '',
        }));

        if (submit === '1') {
            sheet.status      = 'SUBMITTED';
            sheet.submittedBy = teacherId;
            sheet.submittedAt = new Date();
            sheet.auditLog.push({ action: 'SUBMITTED', by: teacherId });
        } else {
            sheet.auditLog.push({ action: 'SAVED_DRAFT', by: teacherId });
        }
        await sheet.save();

        // Check if all subjects submitted → update exam status to SUBMITTED
        const allSheets = await ExamMarksSheet.find({ exam: examId });
        const allSubmitted = allSheets.every(s => s.status === 'SUBMITTED');
        if (allSubmitted && exam.status === 'MARKS_PENDING') {
            exam.status = 'SUBMITTED';
            exam.auditLog.push({ action: 'ALL_MARKS_SUBMITTED', by: teacherId });
            await exam.save();
        }

        req.flash('success', submit === '1' ? 'Marks submitted for validation.' : 'Marks saved as draft.');
        res.redirect('/teacher/results/marks-entry');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to save marks: ' + err.message);
        res.redirect(`/teacher/results/marks-entry/${req.params.examId}/${req.params.subjectId}`);
    }
};

// ─── CLASS TEACHER VALIDATION ─────────────────────────────────────────────────

// GET /teacher/results/validation
exports.teacherGetValidation = async (req, res) => {
    try {
        const teacherId = req.user._id;

        // Find sections where this user is classTeacher
        const sections = await ClassSection.find({ classTeacher: teacherId }).populate('class', 'className classNumber');
        const sectionIds = sections.map(s => s._id);

        // Include all statuses; also catch exams this teacher class-approved (fallback if classTeacher not set)
        const exams = await FormalExam.find({
            $or: [
                { section: { $in: sectionIds } },
                { classApprovedBy: teacherId },
            ],
            status: { $in: ['MARKS_PENDING', 'SUBMITTED', 'REJECTED', 'REOPENED', 'CLASS_APPROVED', 'FINAL_APPROVED'] },
        })
            .populate('section')
            .populate({ path: 'section', populate: { path: 'class', select: 'className' } })
            .populate('academicYear', 'yearName')
            .populate('subjects.subject', 'subjectName')
            .sort({ createdAt: -1 });

        res.render('teacher/results/validation', {
            title: 'Marks Validation',
            layout: 'layouts/main',
            exams,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load validation list.');
        res.redirect('/teacher/dashboard');
    }
};

// GET /teacher/results/validation/:examId
exports.teacherGetValidationDetail = async (req, res) => {
    try {
        const teacherId = req.user._id;
        const exam = await FormalExam.findById(req.params.examId)
            .populate('subjects.subject', 'subjectName subjectCode')
            .populate('subjects.assignedTeachers', 'name')
            .populate('section');

        const section = await ClassSection.findById(exam.section._id);
        const isClassTeacher = String(section.classTeacher) === String(teacherId);
        const isApprover     = String(exam.classApprovedBy || '') === String(teacherId);
        if (!isClassTeacher && !isApprover) {
            req.flash('error', 'Not your section.');
            return res.redirect('/teacher/results/validation');
        }

        const sheets = await ExamMarksSheet.find({ exam: exam._id })
            .populate('subject', 'subjectName')
            .populate('submittedBy', 'name')
            .populate('entries.student', 'name');

        const students = await User.find({ _id: { $in: section.enrolledStudents } }, 'name').sort({ name: 1 });

        // Load final results if exam is fully approved
        const results = ['CLASS_APPROVED', 'FINAL_APPROVED'].includes(exam.status)
            ? await FormalResult.find({ exam: exam._id })
                .populate('student', 'name')
                .populate('subjects.subject', 'subjectName')
                .sort({ rank: 1 })
            : [];

        res.render('teacher/results/validation-detail', {
            title: `Validate: ${exam.title}`,
            layout: 'layouts/main',
            exam, sheets, students, results,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load exam.');
        res.redirect('/teacher/results/validation');
    }
};

// POST /teacher/results/validation/:examId/approve
exports.teacherPostApproveExam = async (req, res) => {
    try {
        const teacherId = req.user._id;
        const exam = await FormalExam.findById(req.params.examId);

        const section = await ClassSection.findById(exam.section);
        if (String(section.classTeacher) !== String(teacherId)) {
            req.flash('error', 'Not authorized.');
            return res.redirect('/teacher/results/validation');
        }

        // Validate all sheets are submitted and all entries complete
        const sheets = await ExamMarksSheet.find({ exam: exam._id });
        for (const sheet of sheets) {
            if (sheet.status !== 'SUBMITTED') {
                req.flash('error', `Marks for subject not yet submitted.`);
                return res.redirect(`/teacher/results/validation/${exam._id}`);
            }
            const incomplete = sheet.entries.some(e => e.marksObtained === null && !e.isAbsent);
            if (incomplete) {
                req.flash('error', 'Some student marks are missing.');
                return res.redirect(`/teacher/results/validation/${exam._id}`);
            }
        }

        exam.status = 'CLASS_APPROVED';
        exam.classApprovedBy = teacherId;
        exam.classApprovedAt = new Date();
        exam.auditLog.push({ action: 'CLASS_APPROVED', by: teacherId, notes: req.body.notes || '' });
        await exam.save();

        req.flash('success', 'Exam approved. Awaiting admin final approval.');
        res.redirect('/teacher/results/validation');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to approve: ' + err.message);
        res.redirect(`/teacher/results/validation/${req.params.examId}`);
    }
};

// POST /teacher/results/validation/:examId/reject
exports.teacherPostRejectExam = async (req, res) => {
    try {
        const teacherId = req.user._id;
        const exam = await FormalExam.findById(req.params.examId);

        const section = await ClassSection.findById(exam.section);
        if (String(section.classTeacher) !== String(teacherId)) {
            req.flash('error', 'Not authorized.');
            return res.redirect('/teacher/results/validation');
        }

        exam.status = 'REJECTED';
        exam.rejectionReason = req.body.reason || '';
        exam.auditLog.push({ action: 'REJECTED_BY_CLASS_TEACHER', by: teacherId, notes: req.body.reason || '' });
        // Reset marks sheets to draft for re-entry
        await ExamMarksSheet.updateMany({ exam: exam._id }, { status: 'DRAFT', submittedBy: null, submittedAt: null });
        await exam.save();

        req.flash('success', 'Exam rejected. Subject teachers must re-enter marks.');
        res.redirect('/teacher/results/validation');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to reject: ' + err.message);
        res.redirect(`/teacher/results/validation/${req.params.examId}`);
    }
};

// ─── STUDENT CONTROLLERS ──────────────────────────────────────────────────────

// GET /student/results
exports.studentGetResults = async (req, res) => {
    try {
        const student = req.user;
        const profile = await StudentProfile.findOne({ user: student._id }).populate('currentSection');

        const results = await FormalResult.find({ student: student._id })
            .populate('exam', 'title examType publishDate')
            .populate('subjects.subject', 'subjectName')
            .sort({ 'exam.createdAt': -1 });

        // Only show published results (FINAL_APPROVED + publishDate <= today)
        const today = new Date();
        const visibleResults = results.filter(r => {
            const exam = r.exam;
            return exam && new Date(exam.publishDate) <= today;
        });

        res.render('student/results/index', {
            title: 'My Results',
            layout: 'layouts/main',
            results: visibleResults,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load results.');
        res.redirect('/student/dashboard');
    }
};

// GET /student/results/:resultId
exports.studentGetResultDetail = async (req, res) => {
    try {
        const result = await FormalResult.findById(req.params.resultId)
            .populate('exam', 'title examType publishDate academicYear section')
            .populate('subjects.subject', 'subjectName subjectCode')
            .populate('section')
            .populate({ path: 'section', populate: { path: 'class', select: 'className' } });

        if (!result || String(result.student) !== String(req.user._id)) {
            req.flash('error', 'Result not found.');
            return res.redirect('/student/results');
        }

        const today = new Date();
        if (new Date(result.exam.publishDate) > today) {
            req.flash('error', 'Result not yet published.');
            return res.redirect('/student/results');
        }

        res.render('student/results/detail', {
            title: `Result: ${result.exam.title}`,
            layout: 'layouts/main',
            result,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load result.');
        res.redirect('/student/results');
    }
};

// ─── PARENT CONTROLLERS ───────────────────────────────────────────────────────

// GET /parent/results
exports.parentGetResults = async (req, res) => {
    try {
        const parent = req.user;
        const children = await StudentProfile.find({ parent: parent._id }).populate('user', 'name');

        const today = new Date();
        const allResults = [];
        for (const child of children) {
            const results = await FormalResult.find({ student: child.user._id })
                .populate('exam', 'title examType publishDate')
                .populate('subjects.subject', 'subjectName')
                .sort({ generatedAt: -1 });

            const visible = results.filter(r => r.exam && new Date(r.exam.publishDate) <= today);
            allResults.push({ child: child.user, results: visible });
        }

        res.render('parent/results/index', {
            title: 'Child Results',
            layout: 'layouts/main',
            allResults,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load results.');
        res.redirect('/parent/dashboard');
    }
};

// GET /parent/results/:resultId
exports.parentGetResultDetail = async (req, res) => {
    try {
        const parent = req.user;
        const result = await FormalResult.findById(req.params.resultId)
            .populate('exam', 'title examType publishDate')
            .populate('subjects.subject', 'subjectName subjectCode')
            .populate('student', 'name')
            .populate('section')
            .populate({ path: 'section', populate: { path: 'class', select: 'className' } });

        if (!result) {
            req.flash('error', 'Result not found.');
            return res.redirect('/parent/results');
        }

        // Verify this student is a child of the parent
        const childProfile = await StudentProfile.findOne({ user: result.student._id, parent: parent._id });
        if (!childProfile) {
            req.flash('error', 'Access denied.');
            return res.redirect('/parent/results');
        }

        const today = new Date();
        if (new Date(result.exam.publishDate) > today) {
            req.flash('error', 'Result not yet published.');
            return res.redirect('/parent/results');
        }

        res.render('parent/results/detail', {
            title: `Result: ${result.exam.title}`,
            layout: 'layouts/main',
            result,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load result.');
        res.redirect('/parent/results');
    }
};
