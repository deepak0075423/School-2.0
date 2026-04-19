const ClassTest          = require('../models/ClassTest');
const ClassSection       = require('../models/ClassSection');
const SectionSubjectTeacher = require('../models/SectionSubjectTeacher');
const AcademicYear       = require('../models/AcademicYear');
const Subject            = require('../models/Subject');
const User               = require('../models/User');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcGrade(percentage) {
    if (percentage >= 90) return 'A+';
    if (percentage >= 80) return 'A';
    if (percentage >= 70) return 'B+';
    if (percentage >= 60) return 'B';
    if (percentage >= 50) return 'C';
    if (percentage >= 40) return 'D';
    return 'F';
}

function computeClassStats(test) {
    const scored = test.marks.filter(m => !m.isAbsent && m.marksObtained !== null);
    if (!scored.length) {
        test.classStats = { average: 0, highest: 0, lowest: 0, passPercent: 0 };
        return;
    }
    const values = scored.map(m => m.marksObtained);
    const avg     = values.reduce((a, b) => a + b, 0) / values.length;
    const passed  = scored.filter(m => m.marksObtained >= test.passingMarks).length;
    test.classStats = {
        average:     Math.round(avg * 100) / 100,
        highest:     Math.max(...values),
        lowest:      Math.min(...values),
        passPercent: Math.round((passed / test.marks.length) * 100),
    };
}

// ─── TEACHER CONTROLLERS ──────────────────────────────────────────────────────

// GET /teacher/results/class-tests
exports.teacherGetClassTests = async (req, res) => {
    try {
        const teacherId = req.user._id;
        const school = req.user.school._id;

        const ssts = await SectionSubjectTeacher.find({ teacher: teacherId })
            .populate('section', 'sectionName class')
            .populate({ path: 'section', populate: { path: 'class', select: 'className classNumber' } })
            .populate('subject', 'subjectName');

        const sectionIds = ssts.map(s => s.section._id);

        const tests = await ClassTest.find({ createdBy: teacherId, section: { $in: sectionIds } })
            .populate('section')
            .populate({ path: 'section', populate: { path: 'class', select: 'className' } })
            .populate('subject', 'subjectName')
            .sort({ createdAt: -1 });

        res.render('teacher/results/class-tests/index', {
            title: 'Class Tests',
            layout: 'layouts/main',
            tests, ssts,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load class tests.');
        res.redirect('/teacher/dashboard');
    }
};

// GET /teacher/results/class-tests/create
exports.teacherGetCreateClassTest = async (req, res) => {
    try {
        const teacherId = req.user._id;
        const ssts = await SectionSubjectTeacher.find({ teacher: teacherId })
            .populate('section')
            .populate({ path: 'section', populate: { path: 'class', select: 'className classNumber' } })
            .populate('subject', 'subjectName subjectCode');

        const activeYear = await AcademicYear.findOne({ school: req.user.school._id, status: 'active' });

        res.render('teacher/results/class-tests/create', {
            title: 'Create Class Test',
            layout: 'layouts/main',
            ssts, activeYear,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load form.');
        res.redirect('/teacher/results/class-tests');
    }
};

// POST /teacher/results/class-tests/create
exports.teacherPostCreateClassTest = async (req, res) => {
    try {
        const teacherId = req.user._id;
        const { sectionId, subjectId, title, testDate, maxMarks, passingMarks, topic, description } = req.body;

        // Verify teacher is assigned to this section+subject
        const sst = await SectionSubjectTeacher.findOne({ section: sectionId, subject: subjectId, teacher: teacherId });
        if (!sst) {
            req.flash('error', 'Not authorized for this section/subject.');
            return res.redirect('/teacher/results/class-tests/create');
        }

        const section  = await ClassSection.findById(sectionId);
        const activeYear = await AcademicYear.findOne({ school: req.user.school._id, status: 'active' });

        const students = section.enrolledStudents || [];
        const marks = students.map(sid => ({ student: sid, marksObtained: null, isAbsent: false, remarks: '' }));

        const test = new ClassTest({
            school:       req.user.school._id,
            section:      sectionId,
            subject:      subjectId,
            academicYear: activeYear._id,
            title,
            testDate:     new Date(testDate),
            maxMarks:     parseInt(maxMarks),
            passingMarks: parseInt(passingMarks),
            topic:        topic || '',
            description:  description || '',
            status:       'DRAFT',
            marks,
            createdBy:    teacherId,
            auditLog: [{ action: 'CREATED', by: teacherId }],
        });
        await test.save();

        req.flash('success', 'Class test created.');
        res.redirect(`/teacher/results/class-tests/${test._id}/marks`);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to create test: ' + err.message);
        res.redirect('/teacher/results/class-tests/create');
    }
};

// GET /teacher/results/class-tests/:id/marks
exports.teacherGetTestMarks = async (req, res) => {
    try {
        const teacherId = req.user._id;
        const test = await ClassTest.findById(req.params.id)
            .populate('subject', 'subjectName')
            .populate('section')
            .populate({ path: 'section', populate: { path: 'class', select: 'className' } });

        if (!test || String(test.createdBy) !== String(teacherId)) {
            req.flash('error', 'Not authorized.');
            return res.redirect('/teacher/results/class-tests');
        }
        if (test.status === 'FINAL_APPROVED') {
            req.flash('error', 'Test is locked.');
            return res.redirect('/teacher/results/class-tests');
        }

        const students = await User.find({ _id: { $in: (await ClassSection.findById(test.section._id)).enrolledStudents } }, 'name').sort({ name: 1 });

        const entries = students.map(st => {
            const m = test.marks.find(e => String(e.student) === String(st._id));
            return {
                studentId: st._id,
                studentName: st.name,
                marksObtained: m ? m.marksObtained : null,
                isAbsent: m ? m.isAbsent : false,
                remarks: m ? m.remarks : '',
            };
        });

        res.render('teacher/results/class-tests/marks', {
            title: `Marks: ${test.title}`,
            layout: 'layouts/main',
            test, entries,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load marks form.');
        res.redirect('/teacher/results/class-tests');
    }
};

// POST /teacher/results/class-tests/:id/marks/save
exports.teacherPostSaveTestMarks = async (req, res) => {
    try {
        const teacherId = req.user._id;
        const test = await ClassTest.findById(req.params.id);

        if (!test || String(test.createdBy) !== String(teacherId)) {
            req.flash('error', 'Not authorized.');
            return res.redirect('/teacher/results/class-tests');
        }
        if (test.status === 'FINAL_APPROVED') {
            req.flash('error', 'Test is locked.');
            return res.redirect('/teacher/results/class-tests');
        }

        const { entries, submit } = req.body;
        const entryArr = Array.isArray(entries) ? entries : [entries];

        test.marks = entryArr.map(e => ({
            student:       e.studentId,
            marksObtained: e.isAbsent === 'on' ? null : parseFloat(e.marks),
            isAbsent:      e.isAbsent === 'on',
            remarks:       e.remarks || '',
            grade:         e.isAbsent === 'on' ? 'AB' : calcGrade((parseFloat(e.marks) / test.maxMarks) * 100),
        }));

        if (submit === '1') {
            // Validate all students marked
            const unmarked = test.marks.some(m => m.marksObtained === null && !m.isAbsent);
            if (unmarked) {
                req.flash('error', 'All students must be marked before submitting.');
                return res.redirect(`/teacher/results/class-tests/${test._id}/marks`);
            }
            test.status = 'SUBMITTED';
            test.auditLog.push({ action: 'SUBMITTED', by: teacherId });
        } else {
            test.auditLog.push({ action: 'SAVED_DRAFT', by: teacherId });
        }
        await test.save();

        req.flash('success', submit === '1' ? 'Marks submitted for class teacher approval.' : 'Marks saved.');
        res.redirect('/teacher/results/class-tests');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to save marks: ' + err.message);
        res.redirect(`/teacher/results/class-tests/${req.params.id}/marks`);
    }
};

// POST /teacher/results/class-tests/:id/reopen  (only submitted tests, by original teacher)
exports.teacherPostReopenTest = async (req, res) => {
    try {
        const teacherId = req.user._id;
        const test = await ClassTest.findById(req.params.id);

        if (!test || String(test.createdBy) !== String(teacherId)) {
            req.flash('error', 'Not authorized.');
            return res.redirect('/teacher/results/class-tests');
        }
        if (test.status !== 'FINAL_APPROVED') {
            req.flash('error', 'Only FINAL_APPROVED tests can be reopened.');
            return res.redirect('/teacher/results/class-tests');
        }

        test.status = 'REOPENED';
        test.approvedBy = null;
        test.approvedAt = null;
        test.auditLog.push({ action: 'REOPENED', by: teacherId, notes: req.body.reason || '' });
        await test.save();

        req.flash('success', 'Test reopened for correction.');
        res.redirect('/teacher/results/class-tests');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to reopen test.');
        res.redirect('/teacher/results/class-tests');
    }
};

// ─── CLASS TEACHER VALIDATION (class tests) ───────────────────────────────────

// GET /teacher/results/class-test-validation
exports.teacherGetClassTestValidation = async (req, res) => {
    try {
        const teacherId = req.user._id;
        const sections = await ClassSection.find({ classTeacher: teacherId });
        const sectionIds = sections.map(s => s._id);

        const tests = await ClassTest.find({
            section: { $in: sectionIds },
            status:  { $in: ['SUBMITTED', 'REJECTED', 'REOPENED'] },
        })
            .populate('section')
            .populate({ path: 'section', populate: { path: 'class', select: 'className' } })
            .populate('subject', 'subjectName')
            .populate('createdBy', 'name')
            .sort({ createdAt: -1 });

        res.render('teacher/results/class-test-validation', {
            title: 'Class Test Validation',
            layout: 'layouts/main',
            tests,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load tests.');
        res.redirect('/teacher/dashboard');
    }
};

// GET /teacher/results/class-test-validation/:id
exports.teacherGetClassTestValidationDetail = async (req, res) => {
    try {
        const teacherId = req.user._id;
        const test = await ClassTest.findById(req.params.id)
            .populate('subject', 'subjectName')
            .populate('section')
            .populate({ path: 'section', populate: { path: 'class', select: 'className' } })
            .populate('createdBy', 'name')
            .populate('marks.student', 'name');

        const section = await ClassSection.findById(test.section._id);
        if (String(section.classTeacher) !== String(teacherId)) {
            req.flash('error', 'Not authorized.');
            return res.redirect('/teacher/results/class-test-validation');
        }

        res.render('teacher/results/class-test-validation-detail', {
            title: `Validate: ${test.title}`,
            layout: 'layouts/main',
            test,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load test.');
        res.redirect('/teacher/results/class-test-validation');
    }
};

// POST /teacher/results/class-test-validation/:id/approve
exports.teacherPostApproveClassTest = async (req, res) => {
    try {
        const teacherId = req.user._id;
        const test = await ClassTest.findById(req.params.id);

        const section = await ClassSection.findById(test.section);
        if (String(section.classTeacher) !== String(teacherId)) {
            req.flash('error', 'Not authorized.');
            return res.redirect('/teacher/results/class-test-validation');
        }

        const unmarked = test.marks.some(m => m.marksObtained === null && !m.isAbsent);
        if (unmarked) {
            req.flash('error', 'Incomplete marks — cannot approve.');
            return res.redirect(`/teacher/results/class-test-validation/${test._id}`);
        }

        test.status     = 'FINAL_APPROVED';
        test.approvedBy = teacherId;
        test.approvedAt = new Date();
        test.auditLog.push({ action: 'FINAL_APPROVED', by: teacherId });

        // Compute class stats
        computeClassStats(test);
        await test.save();

        req.flash('success', 'Class test approved. Results available.');
        res.redirect('/teacher/results/class-test-validation');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to approve: ' + err.message);
        res.redirect(`/teacher/results/class-test-validation/${req.params.id}`);
    }
};

// POST /teacher/results/class-test-validation/:id/reject
exports.teacherPostRejectClassTest = async (req, res) => {
    try {
        const teacherId = req.user._id;
        const test = await ClassTest.findById(req.params.id);

        const section = await ClassSection.findById(test.section);
        if (String(section.classTeacher) !== String(teacherId)) {
            req.flash('error', 'Not authorized.');
            return res.redirect('/teacher/results/class-test-validation');
        }

        test.status = 'REJECTED';
        test.rejectionReason = req.body.reason || '';
        test.auditLog.push({ action: 'REJECTED', by: teacherId, notes: req.body.reason || '' });
        await test.save();

        req.flash('success', 'Class test rejected.');
        res.redirect('/teacher/results/class-test-validation');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to reject test.');
        res.redirect(`/teacher/results/class-test-validation/${req.params.id}`);
    }
};

// ─── STUDENT CONTROLLERS ──────────────────────────────────────────────────────

// GET /student/results/class-tests
exports.studentGetClassTests = async (req, res) => {
    try {
        const studentId = req.user._id;
        const profile = await require('../models/StudentProfile').findOne({ user: studentId });
        if (!profile || !profile.currentSection) {
            return res.render('student/results/class-tests', { title: 'Class Tests', layout: 'layouts/main', tests: [] });
        }

        const tests = await ClassTest.find({
            section: profile.currentSection,
            status:  'FINAL_APPROVED',
        })
            .populate('subject', 'subjectName')
            .sort({ testDate: -1 });

        // Extract this student's marks
        const myTests = tests.map(test => {
            const m = test.marks.find(e => String(e.student) === String(studentId));
            return {
                test,
                marks:      m ? m.marksObtained : null,
                isAbsent:   m ? m.isAbsent : false,
                grade:      m ? m.grade : '',
                percentage: m && !m.isAbsent ? Math.round((m.marksObtained / test.maxMarks) * 100) : null,
            };
        });

        res.render('student/results/class-tests', {
            title: 'Class Test Results',
            layout: 'layouts/main',
            myTests,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load class tests.');
        res.redirect('/student/results');
    }
};

// ─── PARENT CONTROLLERS ───────────────────────────────────────────────────────

// GET /parent/results/class-tests
exports.parentGetClassTests = async (req, res) => {
    try {
        const parent = req.user;
        const children = await require('../models/StudentProfile').find({ parent: parent._id }).populate('user', 'name').populate('currentSection');

        const allTests = [];
        for (const child of children) {
            if (!child.currentSection) continue;
            const tests = await ClassTest.find({
                section: child.currentSection._id,
                status:  'FINAL_APPROVED',
            })
                .populate('subject', 'subjectName')
                .sort({ testDate: -1 });

            const myTests = tests.map(test => {
                const m = test.marks.find(e => String(e.student) === String(child.user._id));
                return {
                    test,
                    marks:    m ? m.marksObtained : null,
                    isAbsent: m ? m.isAbsent : false,
                    grade:    m ? m.grade : '',
                };
            });
            allTests.push({ child: child.user, tests: myTests });
        }

        res.render('parent/results/class-tests', {
            title: 'Child Class Test Results',
            layout: 'layouts/main',
            allTests,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load class tests.');
        res.redirect('/parent/results');
    }
};
