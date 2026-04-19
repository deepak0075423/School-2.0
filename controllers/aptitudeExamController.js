const AptitudeExam     = require('../models/AptitudeExam');
const AptitudeQuestion = require('../models/AptitudeQuestion');
const ExamAttempt      = require('../models/ExamAttempt');
const ExamViolation    = require('../models/ExamViolation');
const ExamResult       = require('../models/ExamResult');
const ClassSection     = require('../models/ClassSection');
const AcademicYear     = require('../models/AcademicYear');
const Subject          = require('../models/Subject');
const StudentProfile   = require('../models/StudentProfile');
const Timetable        = require('../models/Timetable');
const TimetableEntry   = require('../models/TimetableEntry');
const User             = require('../models/User');

/* ─── helpers ─────────────────────────────────────────────────── */

// Returns the exam's scheduled start as a Date object
function examStartDate(exam) {
    const [h, m] = (exam.startTime || '00:00').split(':').map(Number);
    const d = new Date(exam.examDate);
    d.setHours(h, m, 0, 0);
    return d;
}

// Exam is editable if it's a draft, OR it's published but more than 15 min before start
function isExamEditable(exam) {
    if (exam.status === 'draft') return true;
    if (exam.status === 'published') {
        return Date.now() < examStartDate(exam).getTime() - 15 * 60 * 1000;
    }
    return false;
}

// Returns true if the exam time window has fully elapsed
function isExamWindowEnded(exam) {
    const endMs = examStartDate(exam).getTime() + exam.duration * 60 * 1000;
    return Date.now() > endMs;
}

// Mark exam as completed if it's published and its window has ended; returns updated doc
async function autoCompleteExam(examId) {
    return AptitudeExam.findOneAndUpdate(
        { _id: examId, status: 'published' },
        { $set: { status: 'completed' } },
        { new: true }
    );
}

function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// Returns sections where the teacher has timetable entries OR is classTeacher
async function getTeacherSections(teacherId, schoolId) {
    const [classTeacherSections, timetableIds] = await Promise.all([
        ClassSection.find({ school: schoolId, classTeacher: teacherId, status: 'active' })
            .populate('class').populate('academicYear').lean(),
        TimetableEntry.find({ teacher: teacherId }).distinct('timetable'),
    ]);

    const timetables = await Timetable.find({ _id: { $in: timetableIds } }).lean();
    const sectionIds = timetables.map(t => t.section.toString());

    const subjectSections = await ClassSection.find({
        _id: { $in: sectionIds },
        school: schoolId,
        status: 'active',
    }).populate('class').populate('academicYear').lean();

    // Merge unique by _id
    const map = {};
    [...classTeacherSections, ...subjectSections].forEach(s => { map[s._id.toString()] = s; });
    return Object.values(map);
}

// Calculate score for a single question
function gradeQuestion(question, selectedOptions) {
    const correct = new Set(question.correctAnswers.map(String));
    const selected = new Set((selectedOptions || []).map(String));

    let isCorrect = false;
    if (question.questionType === 'mcq_single' || question.questionType === 'true_false') {
        isCorrect = selected.size === 1 && correct.has([...selected][0]);
    } else {
        // mcq_multiple: exact match required
        isCorrect = selected.size === correct.size &&
            [...selected].every(o => correct.has(o));
    }
    return {
        isCorrect,
        marksAwarded: isCorrect ? question.marks : 0,
        marksTotal:   question.marks,
    };
}

// Auto-evaluate and persist ExamResult; idempotent
async function evaluateAndSave(attempt, exam) {
    const existing = await ExamResult.findOne({ exam: exam._id, student: attempt.student });
    if (existing) return existing;

    const questions = await AptitudeQuestion.find({ exam: exam._id }).lean();
    const answerMap = {};
    (attempt.answers || []).forEach(a => { answerMap[a.question.toString()] = a.selectedOptions || []; });

    let obtainedMarks = 0;
    const questionResults = questions.map(q => {
        const selected   = answerMap[q._id.toString()] || [];
        const { isCorrect, marksAwarded, marksTotal } = gradeQuestion(q, selected);
        obtainedMarks += marksAwarded;

        const optionTexts = {};
        (q.options || []).forEach(o => { optionTexts[o.optionId] = o.text; });

        return {
            question:       q._id,
            questionText:   q.questionText,
            questionType:   q.questionType,
            studentAnswers: selected,
            correctAnswers: q.correctAnswers,
            optionTexts,
            isCorrect,
            marksAwarded,
            marksTotal,
        };
    });

    const totalMarks = questions.reduce((s, q) => s + q.marks, 0);
    const percentage = totalMarks > 0 ? Math.round((obtainedMarks / totalMarks) * 100 * 100) / 100 : 0;

    return ExamResult.create({
        exam:            exam._id,
        attempt:         attempt._id,
        student:         attempt.student,
        school:          attempt.school,
        section:         attempt.section,
        totalMarks,
        obtainedMarks,
        percentage,
        questionResults,
    });
}

/* ════════════════════════════════════════════════════════════════
   TEACHER — Exam Management
════════════════════════════════════════════════════════════════ */

const getTeacherExams = async (req, res) => {
    try {
        // Auto-complete any published exams whose window has ended
        const publishedExams = await AptitudeExam.find({
            school: req.session.schoolId,
            status: 'published',
        });
        await Promise.all(
            publishedExams
                .filter(e => isExamWindowEnded(e))
                .map(e => { e.status = 'completed'; return e.save(); })
        );

        // Exams this teacher created
        const myExams = await AptitudeExam.find({
            school:    req.session.schoolId,
            createdBy: req.session.userId,
        })
            .populate({ path: 'section', populate: { path: 'class', select: 'className' } })
            .populate('subject', 'subjectName')
            .sort({ createdAt: -1 })
            .lean();

        // Sections where this teacher is classTeacher
        const classTeacherSections = await ClassSection.find({
            school:       req.session.schoolId,
            classTeacher: req.session.userId,
            status:       'active',
        }).lean();

        const classTeacherSectionIds = classTeacherSections.map(s => s._id);

        // ALL exams in those sections created by OTHER teachers (class teacher view)
        const sectionExams = classTeacherSectionIds.length > 0
            ? await AptitudeExam.find({
                school:    req.session.schoolId,
                section:   { $in: classTeacherSectionIds },
                createdBy: { $ne: req.session.userId },
            })
                .populate({ path: 'section', populate: { path: 'class', select: 'className' } })
                .populate('subject', 'subjectName')
                .populate('createdBy', 'name')
                .sort({ examDate: -1 })
                .lean()
            : [];

        res.render('teacher/exams/index', {
            title:          'My Exams',
            layout:         'layouts/main',
            exams:          myExams,
            sectionExams,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load exams.');
        res.redirect('/teacher/dashboard');
    }
};

const getCreateExam = async (req, res) => {
    try {
        const [sections, academicYear, subjects] = await Promise.all([
            getTeacherSections(req.session.userId, req.session.schoolId),
            AcademicYear.findOne({ school: req.session.schoolId, status: 'active' }).lean(),
            Subject.find({ school: req.session.schoolId }).sort('subjectName').lean(),
        ]);

        res.render('teacher/exams/create', {
            title:        'Create Exam',
            layout:       'layouts/main',
            sections,
            academicYear,
            subjects,
            formData:     {},
            errors:       [],
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load form.');
        res.redirect('/teacher/exams');
    }
};

const postCreateExam = async (req, res) => {
    try {
        const {
            title, sectionId, subjectId, examDate, startTime,
            duration, totalQuestions, totalMarks, maxViolations,
        } = req.body;

        const errors = [];
        if (!title || !title.trim())       errors.push('Exam title is required.');
        if (!sectionId)                    errors.push('Section is required.');
        if (!examDate)                     errors.push('Exam date is required.');
        if (!startTime)                    errors.push('Start time is required.');
        if (!duration || duration < 1)     errors.push('Duration must be at least 1 minute.');
        if (!totalQuestions || totalQuestions < 1) errors.push('Total questions must be at least 1.');
        if (!totalMarks || totalMarks < 1) errors.push('Total marks must be at least 1.');

        if (errors.length) {
            const [sections, academicYear, subjects] = await Promise.all([
                getTeacherSections(req.session.userId, req.session.schoolId),
                AcademicYear.findOne({ school: req.session.schoolId, status: 'active' }).lean(),
                Subject.find({ school: req.session.schoolId }).sort('subjectName').lean(),
            ]);
            return res.render('teacher/exams/create', {
                title: 'Create Exam', layout: 'layouts/main',
                sections, academicYear, subjects, errors,
                formData: req.body,
            });
        }

        // Validate teacher owns the section
        const teacherSections = await getTeacherSections(req.session.userId, req.session.schoolId);
        const sectionValid = teacherSections.some(s => s._id.toString() === sectionId);
        if (!sectionValid) {
            req.flash('error', 'You are not assigned to this section.');
            return res.redirect('/teacher/exams/create');
        }

        const section     = await ClassSection.findById(sectionId).lean();
        const academicYear = await AcademicYear.findOne({ school: req.session.schoolId, status: 'active' }).lean();

        const exam = await AptitudeExam.create({
            school:         req.session.schoolId,
            section:        sectionId,
            academicYear:   academicYear?._id,
            subject:        subjectId || null,
            createdBy:      req.session.userId,
            title:          title.trim(),
            examDate:       new Date(examDate),
            startTime,
            duration:       parseInt(duration),
            totalQuestions: parseInt(totalQuestions),
            totalMarks:     parseFloat(totalMarks),
            maxViolations:  parseInt(maxViolations) || 3,
        });

        req.flash('success', `Exam "${exam.title}" created. Now add questions.`);
        res.redirect(`/teacher/exams/${exam._id}/questions`);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to create exam: ' + err.message);
        res.redirect('/teacher/exams/create');
    }
};

const getManageQuestions = async (req, res) => {
    try {
        const exam = await AptitudeExam.findOne({
            _id:    req.params.id,
            school: req.session.schoolId,
        })
            .populate('section', 'sectionName class')
            .populate({ path: 'section', populate: { path: 'class', select: 'className' } })
            .populate('subject', 'subjectName')
            .lean();

        if (!exam) {
            req.flash('error', 'Exam not found.');
            return res.redirect('/teacher/exams');
        }

        // Allow exam owner OR school admin
        if (exam.createdBy.toString() !== req.session.userId && req.session.userRole !== 'school_admin') {
            return res.status(403).render('403', { title: '403 — Access Denied', layout: 'layouts/main', requiredRole: 'exam owner' });
        }

        const questions = await AptitudeQuestion.find({ exam: exam._id }).sort('order').lean();
        const sumMarks  = Math.round(questions.reduce((s, q) => s + q.marks, 0) * 100) / 100;
        const editable  = isExamEditable(exam);

        res.render('teacher/exams/questions', {
            title:     `Questions — ${exam.title}`,
            layout:    'layouts/main',
            exam,
            questions,
            sumMarks,
            editable,
            formData:  {},
            errors:    [],
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load questions.');
        res.redirect('/teacher/exams');
    }
};

const postAddQuestion = async (req, res) => {
    try {
        const exam = await AptitudeExam.findOne({
            _id:    req.params.id,
            school: req.session.schoolId,
        }).lean();

        if (!exam || !isExamEditable(exam)) {
            req.flash('error', 'Cannot edit this exam — it is either completed or within 15 minutes of starting.');
            return res.redirect(`/teacher/exams/${req.params.id}/questions`);
        }

        const { questionText, questionType, marks } = req.body;
        const errors = [];

        if (!questionText || !questionText.trim()) errors.push('Question text is required.');
        if (!questionType) errors.push('Question type is required.');
        if (!marks || parseFloat(marks) < 0.5)    errors.push('Marks must be at least 0.5.');

        let options = [];
        let correctAnswers = [];

        if (questionType === 'true_false') {
            options = [
                { optionId: 'true',  text: 'True'  },
                { optionId: 'false', text: 'False' },
            ];
            const correctTF = req.body.correctTrueFalse;
            if (!correctTF) errors.push('Select the correct answer (True/False).');
            else correctAnswers = [correctTF];

        } else {
            // MCQ single or multiple
            const optionTexts  = Array.isArray(req.body.optionText)  ? req.body.optionText  : [req.body.optionText];
            const optionIds    = Array.isArray(req.body.optionId)    ? req.body.optionId    : [req.body.optionId];
            const correctFlags = Array.isArray(req.body.isCorrect)   ? req.body.isCorrect   : (req.body.isCorrect ? [req.body.isCorrect] : []);

            const validOptions = optionTexts
                .map((t, i) => ({ text: t?.trim(), optionId: optionIds[i] }))
                .filter(o => o.text && o.optionId);

            if (validOptions.length < 2) errors.push('Provide at least 2 options.');
            else options = validOptions;

            correctAnswers = correctFlags;
            if (correctAnswers.length === 0) errors.push('Mark at least one correct answer.');
            if (questionType === 'mcq_single' && correctAnswers.length > 1) errors.push('MCQ single can have only one correct answer.');
        }

        if (errors.length) {
            const questions = await AptitudeQuestion.find({ exam: exam._id }).sort('order').lean();
            const sumMarks  = Math.round(questions.reduce((s, q) => s + q.marks, 0) * 100) / 100;
            return res.render('teacher/exams/questions', {
                title:    `Questions — ${exam.title}`,
                layout:   'layouts/main',
                exam,
                questions,
                sumMarks,
                editable: true,
                errors,
                formData: req.body,
            });
        }

        const count = await AptitudeQuestion.countDocuments({ exam: exam._id });
        await AptitudeQuestion.create({
            exam:           exam._id,
            school:         req.session.schoolId,
            questionText:   questionText.trim(),
            questionType,
            options,
            correctAnswers,
            marks:          parseFloat(marks),
            order:          count + 1,
        });

        req.flash('success', 'Question added.');
        res.redirect(`/teacher/exams/${exam._id}/questions`);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to add question: ' + err.message);
        res.redirect(`/teacher/exams/${req.params.id}/questions`);
    }
};

const getEditQuestion = async (req, res) => {
    try {
        const exam = await AptitudeExam.findOne({
            _id: req.params.id, school: req.session.schoolId,
        })
            .populate({ path: 'section', populate: { path: 'class', select: 'className' } })
            .populate('subject', 'subjectName')
            .lean();

        if (!exam) {
            req.flash('error', 'Exam not found.');
            return res.redirect('/teacher/exams');
        }
        if (exam.createdBy.toString() !== req.session.userId && req.session.userRole !== 'school_admin') {
            return res.status(403).render('403', { title: '403', layout: 'layouts/main', requiredRole: 'exam owner' });
        }
        if (!isExamEditable(exam)) {
            req.flash('error', 'Exam can no longer be edited.');
            return res.redirect(`/teacher/exams/${exam._id}/questions`);
        }

        const editQuestion = await AptitudeQuestion.findOne({ _id: req.params.qid, exam: exam._id }).lean();
        if (!editQuestion) {
            req.flash('error', 'Question not found.');
            return res.redirect(`/teacher/exams/${exam._id}/questions`);
        }

        const questions = await AptitudeQuestion.find({ exam: exam._id }).sort('order').lean();
        const sumMarks  = Math.round(questions.reduce((s, q) => s + q.marks, 0) * 100) / 100;

        res.render('teacher/exams/questions', {
            title:        `Edit Question — ${exam.title}`,
            layout:       'layouts/main',
            exam,
            questions,
            sumMarks,
            editable:     true,
            editQuestion,
            formData:     {},
            errors:       [],
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load question editor.');
        res.redirect(`/teacher/exams/${req.params.id}/questions`);
    }
};

const postEditQuestion = async (req, res) => {
    try {
        const exam = await AptitudeExam.findOne({
            _id: req.params.id, school: req.session.schoolId,
        }).lean();

        if (!exam || !isExamEditable(exam)) {
            req.flash('error', 'Exam can no longer be edited.');
            return res.redirect(`/teacher/exams/${req.params.id}/questions`);
        }

        const question = await AptitudeQuestion.findOne({ _id: req.params.qid, exam: exam._id });
        if (!question) {
            req.flash('error', 'Question not found.');
            return res.redirect(`/teacher/exams/${exam._id}/questions`);
        }

        const { questionText, questionType, marks } = req.body;
        const errors = [];

        if (!questionText || !questionText.trim()) errors.push('Question text is required.');
        if (!questionType)                          errors.push('Question type is required.');
        if (!marks || parseFloat(marks) < 0.5)     errors.push('Marks must be at least 0.5.');

        let options = [];
        let correctAnswers = [];

        if (questionType === 'true_false') {
            options = [
                { optionId: 'true',  text: 'True'  },
                { optionId: 'false', text: 'False' },
            ];
            const correctTF = req.body.correctTrueFalse;
            if (!correctTF) errors.push('Select the correct answer (True/False).');
            else correctAnswers = [correctTF];
        } else {
            const optionTexts  = Array.isArray(req.body.optionText)  ? req.body.optionText  : [req.body.optionText];
            const optionIds    = Array.isArray(req.body.optionId)    ? req.body.optionId    : [req.body.optionId];
            const correctFlags = Array.isArray(req.body.isCorrect)   ? req.body.isCorrect   : (req.body.isCorrect ? [req.body.isCorrect] : []);

            const validOptions = optionTexts
                .map((t, i) => ({ text: t?.trim(), optionId: optionIds[i] }))
                .filter(o => o.text && o.optionId);

            if (validOptions.length < 2) errors.push('Provide at least 2 options.');
            else options = validOptions;

            correctAnswers = correctFlags;
            if (correctAnswers.length === 0)                               errors.push('Mark at least one correct answer.');
            if (questionType === 'mcq_single' && correctAnswers.length > 1) errors.push('MCQ single can have only one correct answer.');
        }

        if (errors.length) {
            const questions     = await AptitudeQuestion.find({ exam: exam._id }).sort('order').lean();
            const sumMarks      = Math.round(questions.reduce((s, q) => s + q.marks, 0) * 100) / 100;
            const editQuestion  = await AptitudeQuestion.findById(req.params.qid).lean();
            return res.render('teacher/exams/questions', {
                title:       `Edit Question — ${exam.title}`,
                layout:      'layouts/main',
                exam,
                questions,
                sumMarks,
                editable:    true,
                editQuestion,
                errors,
                formData:    req.body,
            });
        }

        question.questionText  = questionText.trim();
        question.questionType  = questionType;
        question.options       = options;
        question.correctAnswers = correctAnswers;
        question.marks         = parseFloat(marks);
        await question.save();

        req.flash('success', 'Question updated.');
        res.redirect(`/teacher/exams/${exam._id}/questions`);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to update question: ' + err.message);
        res.redirect(`/teacher/exams/${req.params.id}/questions`);
    }
};

const postDeleteQuestion = async (req, res) => {
    try {
        const exam = await AptitudeExam.findOne({
            _id: req.params.id, school: req.session.schoolId,
        }).lean();
        if (!exam || !isExamEditable(exam)) {
            req.flash('error', 'Cannot delete questions — exam is completed or within 15 minutes of starting.');
            return res.redirect(`/teacher/exams/${req.params.id}/questions`);
        }
        await AptitudeQuestion.findOneAndDelete({ _id: req.params.qid, exam: exam._id });
        req.flash('success', 'Question deleted.');
        res.redirect(`/teacher/exams/${exam._id}/questions`);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to delete question.');
        res.redirect(`/teacher/exams/${req.params.id}/questions`);
    }
};

const postPublishExam = async (req, res) => {
    try {
        const exam = await AptitudeExam.findOne({
            _id: req.params.id, school: req.session.schoolId,
        });
        if (!exam) {
            req.flash('error', 'Exam not found.');
            return res.redirect('/teacher/exams');
        }
        if (exam.createdBy.toString() !== req.session.userId) {
            return res.status(403).render('403', { title: '403', layout: 'layouts/main', requiredRole: 'exam owner' });
        }

        const questions = await AptitudeQuestion.find({ exam: exam._id }).lean();
        const qCount    = questions.length;

        if (qCount < exam.totalQuestions) {
            req.flash('error', `Add ${exam.totalQuestions - qCount} more question(s) before publishing.`);
            return res.redirect(`/teacher/exams/${exam._id}/questions`);
        }
        if (qCount > exam.totalQuestions) {
            req.flash('error', `You have ${qCount} questions but the exam is configured for ${exam.totalQuestions}. Update the exam config or remove extra questions.`);
            return res.redirect(`/teacher/exams/${exam._id}/questions`);
        }

        // Validate total marks matches sum of question marks
        const sumMarks = questions.reduce((s, q) => s + q.marks, 0);
        const roundedSum = Math.round(sumMarks * 100) / 100;
        if (roundedSum !== exam.totalMarks) {
            req.flash('error', `Total marks mismatch: questions add up to ${roundedSum} but exam is configured for ${exam.totalMarks}. Edit the exam config or adjust question marks.`);
            return res.redirect(`/teacher/exams/${exam._id}/questions`);
        }

        exam.status = 'published';
        await exam.save();
        req.flash('success', 'Exam published. Students can now attempt it during the scheduled window.');
        res.redirect(`/teacher/exams/${exam._id}/questions`);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to publish exam.');
        res.redirect(`/teacher/exams/${req.params.id}/questions`);
    }
};

const getEditExam = async (req, res) => {
    try {
        const exam = await AptitudeExam.findOne({
            _id: req.params.id, school: req.session.schoolId,
        })
            .populate({ path: 'section', populate: { path: 'class', select: 'className' } })
            .populate('subject', 'subjectName')
            .lean();

        if (!exam) {
            req.flash('error', 'Exam not found.');
            return res.redirect('/teacher/exams');
        }
        if (exam.createdBy.toString() !== req.session.userId) {
            return res.status(403).render('403', { title: '403', layout: 'layouts/main', requiredRole: 'exam owner' });
        }
        if (!isExamEditable(exam)) {
            req.flash('error', 'This exam can no longer be edited (within 15 min of start or already completed).');
            return res.redirect(`/teacher/exams/${exam._id}/questions`);
        }

        const [sections, subjects] = await Promise.all([
            getTeacherSections(req.session.userId, req.session.schoolId),
            Subject.find({ school: req.session.schoolId }).sort('subjectName').lean(),
        ]);

        res.render('teacher/exams/edit', {
            title:  `Edit Exam — ${exam.title}`,
            layout: 'layouts/main',
            exam,
            sections,
            subjects,
            errors: [],
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load edit form.');
        res.redirect('/teacher/exams');
    }
};

const postEditExam = async (req, res) => {
    try {
        const exam = await AptitudeExam.findOne({
            _id: req.params.id, school: req.session.schoolId,
        });

        if (!exam) {
            req.flash('error', 'Exam not found.');
            return res.redirect('/teacher/exams');
        }
        if (exam.createdBy.toString() !== req.session.userId) {
            return res.status(403).render('403', { title: '403', layout: 'layouts/main', requiredRole: 'exam owner' });
        }
        if (!isExamEditable(exam)) {
            req.flash('error', 'This exam can no longer be edited.');
            return res.redirect(`/teacher/exams/${exam._id}/questions`);
        }

        const {
            title, subjectId, examDate, startTime,
            duration, totalQuestions, totalMarks, maxViolations,
        } = req.body;

        const errors = [];
        if (!title || !title.trim())                    errors.push('Exam title is required.');
        if (!examDate)                                   errors.push('Exam date is required.');
        if (!startTime)                                  errors.push('Start time is required.');
        if (!duration || parseInt(duration) < 1)        errors.push('Duration must be at least 1 minute.');
        if (!totalQuestions || parseInt(totalQuestions) < 1) errors.push('Total questions must be at least 1.');
        if (!totalMarks || parseFloat(totalMarks) < 1)  errors.push('Total marks must be at least 1.');

        if (errors.length) {
            const [sections, subjects] = await Promise.all([
                getTeacherSections(req.session.userId, req.session.schoolId),
                Subject.find({ school: req.session.schoolId }).sort('subjectName').lean(),
            ]);
            return res.render('teacher/exams/edit', {
                title:  `Edit Exam — ${exam.title}`,
                layout: 'layouts/main',
                exam: { ...exam.toObject(), ...req.body },
                sections,
                subjects,
                errors,
            });
        }

        exam.title          = title.trim();
        exam.subject        = subjectId || null;
        exam.examDate       = new Date(examDate);
        exam.startTime      = startTime;
        exam.duration       = parseInt(duration);
        exam.totalQuestions = parseInt(totalQuestions);
        exam.totalMarks     = parseFloat(totalMarks);
        exam.maxViolations  = parseInt(maxViolations) || 3;
        await exam.save();

        req.flash('success', 'Exam configuration updated.');
        res.redirect(`/teacher/exams/${exam._id}/questions`);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to update exam: ' + err.message);
        res.redirect(`/teacher/exams/${req.params.id}/questions`);
    }
};

const postDeleteExam = async (req, res) => {
    try {
        const exam = await AptitudeExam.findOne({
            _id: req.params.id, school: req.session.schoolId, createdBy: req.session.userId,
        });
        if (!exam || exam.status !== 'draft') {
            req.flash('error', 'Only draft exams can be deleted.');
            return res.redirect('/teacher/exams');
        }
        await AptitudeQuestion.deleteMany({ exam: exam._id });
        await exam.deleteOne();
        req.flash('success', 'Exam deleted.');
        res.redirect('/teacher/exams');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to delete exam.');
        res.redirect('/teacher/exams');
    }
};

const getSubmissions = async (req, res) => {
    try {
        // Auto-complete exam if its window has ended
        const examRaw = await AptitudeExam.findOne({ _id: req.params.id, school: req.session.schoolId });
        if (!examRaw) {
            req.flash('error', 'Exam not found.');
            return res.redirect('/teacher/exams');
        }
        if (examRaw.status === 'published' && isExamWindowEnded(examRaw)) {
            examRaw.status = 'completed';
            await examRaw.save();
        }

        const exam = await AptitudeExam.findById(req.params.id)
            .populate({ path: 'section', populate: { path: 'class', select: 'className' } })
            .populate('subject', 'subjectName')
            .lean();

        if (!exam) {
            req.flash('error', 'Exam not found.');
            return res.redirect('/teacher/exams');
        }

        const results = await ExamResult.find({ exam: exam._id })
            .populate('student', 'name email')
            .sort({ obtainedMarks: -1 })
            .lean();

        const attempts = await ExamAttempt.find({ exam: exam._id })
            .populate('student', 'name email')
            .lean();

        // Build a map: studentId → attempt (for in-progress students)
        const attemptMap = {};
        attempts.forEach(a => { attemptMap[a.student._id.toString()] = a; });

        // Enrolled students in the section
        const section = await ClassSection.findById(exam.section).lean();
        const enrolledIds = section?.enrolledStudents || [];

        res.render('teacher/exams/submissions', {
            title:      `Submissions — ${exam.title}`,
            layout:     'layouts/main',
            exam,
            results,
            attemptMap,
            enrolledIds: enrolledIds.map(String),
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load submissions.');
        res.redirect('/teacher/exams');
    }
};

const getStudentResponse = async (req, res) => {
    try {
        const exam = await AptitudeExam.findOne({
            _id: req.params.id, school: req.session.schoolId,
        }).lean();
        if (!exam) {
            req.flash('error', 'Exam not found.');
            return res.redirect('/teacher/exams');
        }

        const result = await ExamResult.findOne({
            exam:    exam._id,
            student: req.params.studentId,
        }).populate('student', 'name email').lean();

        if (!result) {
            req.flash('error', 'Result not found for this student.');
            return res.redirect(`/teacher/exams/${exam._id}/submissions`);
        }

        res.render('teacher/exams/student-response', {
            title:  `Response — ${result.student?.name}`,
            layout: 'layouts/main',
            exam,
            result,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load student response.');
        res.redirect(`/teacher/exams/${req.params.id}/submissions`);
    }
};

const getAnalytics = async (req, res) => {
    try {
        const exam = await AptitudeExam.findOne({
            _id: req.params.id, school: req.session.schoolId,
        })
            .populate({ path: 'section', populate: { path: 'class', select: 'className' } })
            .populate('subject', 'subjectName')
            .lean();

        if (!exam) {
            req.flash('error', 'Exam not found.');
            return res.redirect('/teacher/exams');
        }

        const results = await ExamResult.find({ exam: exam._id }).lean();
        const questions = await AptitudeQuestion.find({ exam: exam._id }).sort('order').lean();

        let analytics = null;
        if (results.length > 0) {
            const scores = results.map(r => r.obtainedMarks);
            const avg    = scores.reduce((s, v) => s + v, 0) / scores.length;
            const high   = Math.max(...scores);
            const low    = Math.min(...scores);

            // Score distribution buckets: 0-20%, 21-40%, 41-60%, 61-80%, 81-100%
            const buckets = [0, 0, 0, 0, 0];
            results.forEach(r => {
                const pct = r.percentage;
                if      (pct <= 20) buckets[0]++;
                else if (pct <= 40) buckets[1]++;
                else if (pct <= 60) buckets[2]++;
                else if (pct <= 80) buckets[3]++;
                else                buckets[4]++;
            });

            // Per-question correct %
            const questionStats = questions.map(q => {
                const correct = results.filter(r => {
                    const qr = r.questionResults?.find(qRes =>
                        qRes.question?.toString() === q._id.toString()
                    );
                    return qr?.isCorrect;
                }).length;
                return {
                    question:   q,
                    correctCount: correct,
                    totalCount:   results.length,
                    correctPct:   results.length > 0 ? Math.round((correct / results.length) * 100) : 0,
                };
            });

            analytics = {
                totalSubmissions: results.length,
                avgScore:  Math.round(avg * 100) / 100,
                highScore: high,
                lowScore:  low,
                avgPct:    Math.round((avg / exam.totalMarks) * 100),
                buckets,
                questionStats,
            };
        }

        res.render('teacher/exams/analytics', {
            title:     `Analytics — ${exam.title}`,
            layout:    'layouts/main',
            exam,
            analytics,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load analytics.');
        res.redirect('/teacher/exams');
    }
};

const getResultApproval = async (req, res) => {
    try {
        // Auto-complete exam if its window has ended and it's still published
        let examRaw = await AptitudeExam.findOne({ _id: req.params.id, school: req.session.schoolId });
        if (!examRaw) {
            req.flash('error', 'Exam not found.');
            return res.redirect('/teacher/exams');
        }
        if (examRaw.status === 'published' && isExamWindowEnded(examRaw)) {
            examRaw.status = 'completed';
            await examRaw.save();
        }

        const exam = await AptitudeExam.findById(req.params.id)
            .populate({ path: 'section', populate: { path: 'class', select: 'className' } })
            .populate('subject', 'subjectName')
            .populate('subjectTeacherApprovedBy', 'name')
            .populate('resultApprovedBy', 'name')
            .lean();

        const section = await ClassSection.findById(exam.section).lean();
        const isSubjectTeacher = exam.createdBy.toString() === req.session.userId;
        const isClassTeacher   = section?.classTeacher?.toString() === req.session.userId;

        // Access: subject teacher (exam creator) OR class teacher of the section
        if (!isSubjectTeacher && !isClassTeacher) {
            req.flash('error', 'You do not have access to this result approval page.');
            return res.redirect('/teacher/exams');
        }

        // Class teacher can only access after subject teacher has approved
        if (isClassTeacher && !isSubjectTeacher && exam.subjectTeacherApprovalStatus !== 'approved') {
            req.flash('error', 'The subject teacher has not yet approved results for this exam.');
            return res.redirect('/teacher/exams');
        }

        const results = await ExamResult.find({ exam: exam._id })
            .populate('student', 'name email')
            .sort({ obtainedMarks: -1 })
            .lean();

        res.render('teacher/exams/result-approval', {
            title:           `Result Approval — ${exam.title}`,
            layout:          'layouts/main',
            exam,
            results,
            section,
            isSubjectTeacher,
            isClassTeacher,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load approval page.');
        res.redirect('/teacher/exams');
    }
};

// Step 1: Subject teacher approves/rejects their own exam results
const postSubjectApproveResults = async (req, res) => {
    try {
        const exam = await AptitudeExam.findOne({
            _id:       req.params.id,
            school:    req.session.schoolId,
            createdBy: req.session.userId,
        });
        if (!exam) {
            req.flash('error', 'Exam not found or you are not the subject teacher.');
            return res.redirect('/teacher/exams');
        }
        if (!isExamWindowEnded(exam)) {
            req.flash('error', 'Results can only be approved after the exam window has ended.');
            return res.redirect(`/teacher/exams/${exam._id}/result-approval`);
        }
        // Auto-complete status if still published
        if (exam.status === 'published') {
            exam.status = 'completed';
        }

        const { action, rejectionReason } = req.body;

        if (action === 'approve') {
            exam.subjectTeacherApprovalStatus = 'approved';
            exam.subjectTeacherApprovedBy     = req.session.userId;
            exam.subjectTeacherApprovedAt     = new Date();
            exam.subjectTeacherRejectionReason = '';
            req.flash('success', 'Results approved. The class teacher can now do the final approval.');
        } else {
            exam.subjectTeacherApprovalStatus  = 'rejected';
            exam.subjectTeacherRejectionReason = rejectionReason || '';
            req.flash('info', 'Results marked as rejected/needs review.');
        }

        await exam.save();
        res.redirect(`/teacher/exams/${exam._id}/result-approval`);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to save approval decision.');
        res.redirect(`/teacher/exams/${req.params.id}/result-approval`);
    }
};

// Step 2: Class teacher sets publish date and gives final approval
const postApproveResults = async (req, res) => {
    try {
        const exam = await AptitudeExam.findOne({
            _id: req.params.id, school: req.session.schoolId,
        });
        if (!exam) {
            req.flash('error', 'Exam not found.');
            return res.redirect('/teacher/exams');
        }

        const section = await ClassSection.findById(exam.section).lean();
        if (!section || section.classTeacher?.toString() !== req.session.userId) {
            req.flash('error', 'Only the class teacher can give final approval.');
            return res.redirect('/teacher/exams');
        }

        if (exam.subjectTeacherApprovalStatus !== 'approved') {
            req.flash('error', 'Subject teacher has not yet approved results. Final approval is not available.');
            return res.redirect(`/teacher/exams/${exam._id}/result-approval`);
        }

        const { action, publishDate, rejectionReason } = req.body;

        if (action === 'approve') {
            if (!publishDate) {
                req.flash('error', 'Please set a result publication date.');
                return res.redirect(`/teacher/exams/${exam._id}/result-approval`);
            }
            exam.resultApprovalStatus = 'approved';
            exam.resultApprovedBy     = req.session.userId;
            exam.resultApprovedAt     = new Date();
            exam.resultPublishDate    = new Date(publishDate);
            req.flash('success', `Results approved. Students can view results from ${new Date(publishDate).toDateString()}.`);
        } else {
            exam.resultApprovalStatus  = 'rejected';
            exam.resultRejectionReason = rejectionReason || '';
            req.flash('info', 'Results rejected. The subject teacher has been notified.');
        }

        await exam.save();
        res.redirect(`/teacher/exams/${exam._id}/result-approval`);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to save approval decision.');
        res.redirect(`/teacher/exams/${req.params.id}/result-approval`);
    }
};

/* ════════════════════════════════════════════════════════════════
   STUDENT — Exam Attempt
════════════════════════════════════════════════════════════════ */

const getStudentExams = async (req, res) => {
    try {
        // Find the section the student is enrolled in (same pattern as studentClassController)
        const activeYear = await AcademicYear.findOne({ school: req.session.schoolId, status: 'active' }).lean();
        const enrolledSection = activeYear
            ? await ClassSection.findOne({
                school:           req.session.schoolId,
                academicYear:     activeYear._id,
                enrolledStudents: req.session.userId,
            }).lean()
            : null;

        if (!enrolledSection) {
            return res.render('student/exams/index', {
                title: 'My Exams', layout: 'layouts/main', exams: [], attemptMap: {},
            });
        }

        const exams = await AptitudeExam.find({
            school:  req.session.schoolId,
            section: enrolledSection._id,
            status:  'published',
        })
            .populate('subject', 'subjectName')
            .sort({ examDate: 1 })
            .lean();

        // Get student's attempts for these exams
        const examIds = exams.map(e => e._id);
        const myAttempts = await ExamAttempt.find({
            exam:    { $in: examIds },
            student: req.session.userId,
        }).lean();

        const attemptMap = {};
        myAttempts.forEach(a => { attemptMap[a.exam.toString()] = a; });

        // Annotate each exam with time window status
        const now = Date.now();
        exams.forEach(e => {
            const [h, m]   = (e.startTime || '00:00').split(':').map(Number);
            const examStart = new Date(e.examDate);
            examStart.setHours(h, m, 0, 0);
            const examEnd = new Date(examStart.getTime() + e.duration * 60000);
            e._examStart  = examStart;
            e._examEnd    = examEnd;
            e._windowStatus = now < examStart.getTime() ? 'upcoming'
                : now > examEnd.getTime()               ? 'ended'
                : 'active';
        });

        res.render('student/exams/index', {
            title:  'My Exams',
            layout: 'layouts/main',
            exams,
            attemptMap,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load exams.');
        res.redirect('/student/dashboard');
    }
};

const getAttemptExam = async (req, res) => {
    try {
        const exam = await AptitudeExam.findOne({
            _id:    req.params.id,
            school: req.session.schoolId,
            status: 'published',
        }).lean();

        if (!exam) {
            req.flash('error', 'Exam not found or not available.');
            return res.redirect('/student/exams');
        }

        // Check student is enrolled in the exam's section
        const enrolledSection = await ClassSection.findOne({
            _id:              exam.section,
            school:           req.session.schoolId,
            enrolledStudents: req.session.userId,
        }).lean();
        if (!enrolledSection) {
            req.flash('error', 'You are not enrolled in this exam\'s section.');
            return res.redirect('/student/exams');
        }

        // Check time window
        const [h, m]   = (exam.startTime || '00:00').split(':').map(Number);
        const examStart = new Date(exam.examDate);
        examStart.setHours(h, m, 0, 0);
        const examEnd = new Date(examStart.getTime() + exam.duration * 60000);
        const now     = new Date();

        // Allow a 2-minute early entry buffer
        if (now < new Date(examStart.getTime() - 2 * 60000)) {
            req.flash('error', `Exam starts at ${examStart.toLocaleTimeString()}. Please come back then.`);
            return res.redirect('/student/exams');
        }

        // Check if already submitted
        let attempt = await ExamAttempt.findOne({
            exam:    exam._id,
            student: req.session.userId,
        });

        if (attempt && (attempt.status === 'submitted' || attempt.status === 'auto_submitted')) {
            req.flash('error', 'You have already submitted this exam.');
            return res.redirect('/student/exams');
        }

        // If past end time and attempt is in_progress → auto-submit
        if (now > examEnd && attempt && attempt.status === 'in_progress') {
            attempt.status      = 'auto_submitted';
            attempt.submittedAt = examEnd;
            await attempt.save();
            await evaluateAndSave(attempt, exam);
            req.flash('error', 'The exam window has ended. Your answers have been auto-submitted.');
            return res.redirect('/student/exams');
        }

        if (now > examEnd) {
            req.flash('error', 'The exam window has ended.');
            return res.redirect('/student/exams');
        }

        const questions = await AptitudeQuestion.find({ exam: exam._id }).lean();

        // Create attempt if not started
        if (!attempt) {
            const shuffledQIds = shuffleArray(questions.map(q => q._id));
            const optionOrders = questions.map(q => {
                let opts = [...(q.options || [])];
                if (q.questionType !== 'true_false') opts = shuffleArray(opts);
                return { question: q._id, options: opts.map(o => ({ optionId: o.optionId, text: o.text })) };
            });

            attempt = await ExamAttempt.create({
                exam:          exam._id,
                student:       req.session.userId,
                school:        req.session.schoolId,
                section:       exam.section,
                questionOrder: shuffledQIds,
                optionOrders,
                answers:       [],
                startedAt:     now,
                serverEndTime: examEnd,
                status:        'in_progress',
            });
        } else if (attempt.status === 'not_started') {
            attempt.startedAt     = now;
            attempt.serverEndTime = examEnd;
            attempt.status        = 'in_progress';
            await attempt.save();
        }

        // Build question map for lookup
        const questionMap = {};
        questions.forEach(q => { questionMap[q._id.toString()] = q; });

        // Build ordered question list with shuffled options
        const orderedQuestions = attempt.questionOrder.map(qId => {
            const q    = questionMap[qId.toString()];
            const oOrd = attempt.optionOrders.find(o => o.question.toString() === qId.toString());
            return { ...q, options: oOrd ? oOrd.options : q.options };
        }).filter(Boolean);

        // Build answer map
        const answerMap = {};
        (attempt.answers || []).forEach(a => {
            answerMap[a.question.toString()] = a.selectedOptions || [];
        });

        res.render('student/exams/attempt', {
            title:            exam.title,
            layout:           'layouts/exam',
            exam,
            attempt,
            orderedQuestions,
            answerMap,
            serverEndTime:    attempt.serverEndTime.getTime(),
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to start exam.');
        res.redirect('/student/exams');
    }
};

// AJAX: save a single answer
const postSaveAnswer = async (req, res) => {
    try {
        const { questionId, selectedOptions } = req.body;
        const options = Array.isArray(selectedOptions) ? selectedOptions : (selectedOptions ? [selectedOptions] : []);

        const attempt = await ExamAttempt.findOne({
            exam:    req.params.id,
            student: req.session.userId,
            status:  'in_progress',
        });

        if (!attempt) return res.json({ success: false, message: 'Attempt not found or already submitted.' });

        // Server-side time check
        if (new Date() > attempt.serverEndTime) {
            attempt.status      = 'auto_submitted';
            attempt.submittedAt = attempt.serverEndTime;
            await attempt.save();
            const exam = await AptitudeExam.findById(req.params.id).lean();
            await evaluateAndSave(attempt, exam);
            return res.json({ success: false, autoSubmitted: true, message: 'Time expired. Exam auto-submitted.' });
        }

        const idx = attempt.answers.findIndex(a => a.question.toString() === questionId);
        if (idx >= 0) {
            attempt.answers[idx].selectedOptions = options;
            attempt.answers[idx].savedAt         = new Date();
        } else {
            attempt.answers.push({ question: questionId, selectedOptions: options, savedAt: new Date() });
        }
        attempt.markModified('answers');
        await attempt.save();

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: 'Server error.' });
    }
};

// AJAX: log a violation
const postLogViolation = async (req, res) => {
    try {
        const { violationType } = req.body;

        const attempt = await ExamAttempt.findOne({
            exam:    req.params.id,
            student: req.session.userId,
            status:  'in_progress',
        });

        if (!attempt) return res.json({ success: false });

        const exam = await AptitudeExam.findById(req.params.id).lean();

        await ExamViolation.create({
            attempt:       attempt._id,
            student:       req.session.userId,
            exam:          exam._id,
            school:        req.session.schoolId,
            violationType: violationType || 'tab_switch',
        });

        attempt.violationCount = (attempt.violationCount || 0) + 1;
        await attempt.save();

        if (attempt.violationCount >= exam.maxViolations) {
            attempt.status      = 'auto_submitted';
            attempt.submittedAt = new Date();
            await attempt.save();
            await evaluateAndSave(attempt, exam);
            return res.json({ success: true, autoSubmit: true, message: 'Too many violations. Exam auto-submitted.' });
        }

        const remaining = exam.maxViolations - attempt.violationCount;
        return res.json({
            success:           true,
            autoSubmit:        false,
            violationCount:    attempt.violationCount,
            warningsRemaining: remaining,
            message:           `Warning: ${remaining} violation(s) remaining before auto-submit.`,
        });
    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
};

// POST: final submit
const postSubmitExam = async (req, res) => {
    try {
        const attempt = await ExamAttempt.findOne({
            exam:    req.params.id,
            student: req.session.userId,
            status:  'in_progress',
        });

        if (!attempt) {
            return res.json({ success: false, message: 'No active attempt found.' });
        }

        const exam = await AptitudeExam.findById(req.params.id).lean();

        attempt.status      = 'submitted';
        attempt.submittedAt = new Date();
        await attempt.save();

        await evaluateAndSave(attempt, exam);

        return res.json({ success: true, redirect: `/student/exams/${exam._id}/result` });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: 'Failed to submit exam.' });
    }
};

const getStudentResult = async (req, res) => {
    try {
        const exam = await AptitudeExam.findOne({
            _id: req.params.id, school: req.session.schoolId,
        })
            .populate({ path: 'section', populate: { path: 'class', select: 'className' } })
            .populate('subject', 'subjectName')
            .lean();

        if (!exam) {
            req.flash('error', 'Exam not found.');
            return res.redirect('/student/exams');
        }

        const result = await ExamResult.findOne({
            exam:    exam._id,
            student: req.session.userId,
        }).lean();

        if (!result) {
            req.flash('error', 'Result not found. Make sure you submitted the exam.');
            return res.redirect('/student/exams');
        }

        // Visibility check: must be approved AND publish date reached
        const now          = new Date();
        const canView      = exam.resultApprovalStatus === 'approved' &&
                             exam.resultPublishDate &&
                             now >= new Date(exam.resultPublishDate);

        // Compute class average for comparison
        let classAvg = null;
        if (canView) {
            const allResults = await ExamResult.find({ exam: exam._id }).lean();
            if (allResults.length > 0) {
                classAvg = Math.round(
                    (allResults.reduce((s, r) => s + r.obtainedMarks, 0) / allResults.length) * 100
                ) / 100;
            }
        }

        res.render('student/exams/result', {
            title:    `Result — ${exam.title}`,
            layout:   'layouts/main',
            exam,
            result,
            canView,
            classAvg,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load result.');
        res.redirect('/student/exams');
    }
};

/* ════════════════════════════════════════════════════════════════
   PARENT — Child Exam Results
════════════════════════════════════════════════════════════════ */

const getParentExamResults = async (req, res) => {
    try {
        const childProfile = await StudentProfile.findOne({
            parent: req.session.userId,
            school: req.session.schoolId,
        }).lean();

        if (!childProfile) {
            return res.render('parent/exams/results', {
                title: 'Exam Results', layout: 'layouts/main', results: [], child: null,
            });
        }

        const child = await User.findById(childProfile.user).select('name email').lean();

        const now = new Date();
        const results = await ExamResult.find({
            student: childProfile.user,
            school:  req.session.schoolId,
        })
            .populate({
                path:     'exam',
                match: {
                    resultApprovalStatus: 'approved',
                    resultPublishDate: { $lte: now },
                },
                populate: [
                    { path: 'section', populate: { path: 'class', select: 'className' } },
                    { path: 'subject', select: 'subjectName' },
                ],
            })
            .sort({ createdAt: -1 })
            .lean();

        const visibleResults = results.filter(r => r.exam); // exam populated only if approved & published

        res.render('parent/exams/results', {
            title:   `${child?.name || 'Child'}'s Exam Results`,
            layout:  'layouts/main',
            results: visibleResults,
            child,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load results.');
        res.redirect('/parent/dashboard');
    }
};

/* ════════════════════════════════════════════════════════════════
   ADMIN — Overview
════════════════════════════════════════════════════════════════ */

const getAdminExams = async (req, res) => {
    try {
        const exams = await AptitudeExam.find({ school: req.session.schoolId })
            .populate({ path: 'section', populate: { path: 'class', select: 'className' } })
            .populate('subject', 'subjectName')
            .populate('createdBy', 'name')
            .sort({ createdAt: -1 })
            .lean();

        // Attach submission counts
        for (const exam of exams) {
            exam._submissionCount = await ExamResult.countDocuments({ exam: exam._id });
        }

        res.render('admin/exams/index', {
            title:  'Aptitude Exams',
            layout: 'layouts/main',
            exams,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load exams.');
        res.redirect('/admin/dashboard');
    }
};

module.exports = {
    // Teacher
    getTeacherExams,
    getCreateExam,
    postCreateExam,
    getManageQuestions,
    postAddQuestion,
    getEditQuestion,
    postEditQuestion,
    postDeleteQuestion,
    postPublishExam,
    getEditExam,
    postEditExam,
    postDeleteExam,
    getSubmissions,
    getStudentResponse,
    getAnalytics,
    getResultApproval,
    postSubjectApproveResults,
    postApproveResults,
    // Student
    getStudentExams,
    getAttemptExam,
    postSaveAnswer,
    postLogViolation,
    postSubmitExam,
    getStudentResult,
    // Parent
    getParentExamResults,
    // Admin
    getAdminExams,
};
