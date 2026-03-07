const User = require('../models/User');
const School = require('../models/School');
const StudentProfile = require('../models/StudentProfile');
const ParentProfile = require('../models/ParentProfile');
const TeacherProfile = require('../models/TeacherProfile');
const bcrypt = require('bcryptjs');
const generatePassword = require('../utils/generatePassword');
const { sendWelcomeEmail } = require('../utils/sendEmail');

// Dashboard
const getDashboard = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const teachers = await User.countDocuments({ role: 'teacher', school: schoolId });
        const students = await User.countDocuments({ role: 'student', school: schoolId });
        const parents = await User.countDocuments({ role: 'parent', school: schoolId });
        const recentUsers = await User.find({ school: schoolId, role: { $nin: ['super_admin', 'school_admin'] } })
            .sort({ createdAt: -1 }).limit(5);

        res.render('admin/dashboard', {
            title: 'School Admin Dashboard',
            layout: 'layouts/main',
            stats: { teachers, students, parents },
            recentUsers,
            schoolName: req.session.schoolName,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load dashboard.');
        res.redirect('/auth/login');
    }
};

// --- TEACHERS ---
const getTeachers = async (req, res) => {
    const teachers = await User.find({ role: 'teacher', school: req.session.schoolId }).sort({ createdAt: -1 });
    res.render('admin/teachers', { title: 'Teachers', layout: 'layouts/main', teachers });
};

const getCreateTeacher = (req, res) => {
    res.render('admin/createTeacher', { title: 'Add Teacher', layout: 'layouts/main' });
};

const postCreateTeacher = async (req, res) => {
    try {
        const { name, email, phone, subjects, classes, qualification, experience } = req.body;
        const existing = await User.findOne({ email: email.toLowerCase() });
        if (existing) {
            req.flash('error', 'A user with this email already exists.');
            return res.redirect('/admin/teachers/create');
        }
        const tempPassword = generatePassword();
        const salt = await bcrypt.genSalt(12);
        const user = await User.create({
            name, email, phone, role: 'teacher',
            password: await bcrypt.hash(tempPassword, salt),
            school: req.session.schoolId,
            isFirstLogin: true,
            createdBy: req.session.userId,
        });
        await TeacherProfile.create({
            user: user._id,
            school: req.session.schoolId,
            subjects: subjects ? subjects.split(',').map(s => s.trim()) : [],
            classes: classes ? classes.split(',').map(c => c.trim()) : [],
            qualification, experience,
        });
        await sendWelcomeEmail({
            to: email, name, email, tempPassword, role: 'teacher',
            schoolName: req.session.schoolName,
        });
        req.flash('success', `Teacher "${name}" created. Credentials sent to ${email}.`);
        res.redirect('/admin/teachers');
    } catch (err) {
        req.flash('error', 'Failed to create teacher: ' + err.message);
        res.redirect('/admin/teachers/create');
    }
};

// --- STUDENTS & PARENTS ---
const getStudents = async (req, res) => {
    const students = await StudentProfile.find({ school: req.session.schoolId })
        .populate('user').populate('parent').sort({ createdAt: -1 });
    res.render('admin/students', { title: 'Students', layout: 'layouts/main', students });
};

const getCreateStudent = (req, res) => {
    res.render('admin/createStudent', { title: 'Add Student', layout: 'layouts/main' });
};

const postCreateStudent = async (req, res) => {
    try {
        const {
            studentName, studentEmail, studentPhone, studentClass, studentSection,
            studentDob, studentAddress,
            parentName, parentEmail, parentPhone, parentRelationship,
        } = req.body;

        // Check for existing emails
        const existingStudent = await User.findOne({ email: studentEmail.toLowerCase() });
        if (existingStudent) {
            req.flash('error', 'Student email already exists.');
            return res.redirect('/admin/students/create');
        }
        const existingParent = await User.findOne({ email: parentEmail.toLowerCase() });
        if (existingParent) {
            req.flash('error', 'Parent email already exists.');
            return res.redirect('/admin/students/create');
        }

        // Create student
        const studentTempPass = generatePassword();
        const studentSalt = await bcrypt.genSalt(12);
        const studentUser = await User.create({
            name: studentName, email: studentEmail, phone: studentPhone,
            role: 'student', password: await bcrypt.hash(studentTempPass, studentSalt),
            school: req.session.schoolId,
            isFirstLogin: true, createdBy: req.session.userId,
        });

        // Create parent
        const parentTempPass = generatePassword();
        const parentSalt = await bcrypt.genSalt(12);
        const parentUser = await User.create({
            name: parentName, email: parentEmail, phone: parentPhone,
            role: 'parent', password: await bcrypt.hash(parentTempPass, parentSalt),
            school: req.session.schoolId,
            isFirstLogin: true, createdBy: req.session.userId,
        });

        // Create profiles
        await StudentProfile.create({
            user: studentUser._id,
            school: req.session.schoolId,
            class: studentClass,
            section: studentSection,
            dob: studentDob || null,
            address: studentAddress,
            parent: parentUser._id,
        });

        await ParentProfile.create({
            user: parentUser._id,
            school: req.session.schoolId,
            relationship: parentRelationship || 'Guardian',
            children: [studentUser._id],
        });

        // Send emails
        await sendWelcomeEmail({
            to: studentEmail, name: studentName, email: studentEmail,
            tempPassword: studentTempPass, role: 'student',
            schoolName: req.session.schoolName,
        });
        await sendWelcomeEmail({
            to: parentEmail, name: parentName, email: parentEmail,
            tempPassword: parentTempPass, role: 'parent',
            schoolName: req.session.schoolName,
        });

        req.flash('success', `Student "${studentName}" and Parent "${parentName}" accounts created. Credentials sent!`);
        res.redirect('/admin/students');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to create student: ' + err.message);
        res.redirect('/admin/students/create');
    }
};

const deleteUser = async (req, res) => {
    await User.findByIdAndDelete(req.params.id);
    req.flash('success', 'User deleted.');
    res.redirect('back');
};

// --- CO-ADMINS ---
const getAdmins = async (req, res) => {
    try {
        const admins = await User.find({ role: 'school_admin', school: req.session.schoolId }).sort({ createdAt: -1 });
        res.render('admin/admins', { title: 'Co-Admins', layout: 'layouts/main', admins });
    } catch (err) {
        req.flash('error', 'Failed to load admins.');
        res.redirect('/admin/dashboard');
    }
};

const getCreateAdmin = (req, res) => {
    res.render('admin/createAdmin', { title: 'Add Co-Admin', layout: 'layouts/main' });
};

const postCreateAdmin = async (req, res) => {
    try {
        const { name, email, phone } = req.body;
        const existing = await User.findOne({ email: email.toLowerCase() });
        if (existing) {
            req.flash('error', 'A user with this email already exists.');
            return res.redirect('/admin/admins/create');
        }
        const tempPassword = generatePassword();
        const adminSalt = await bcrypt.genSalt(12);
        await User.create({
            name,
            email: email.toLowerCase(),
            phone,
            role: 'school_admin',
            password: await bcrypt.hash(tempPassword, adminSalt),
            school: req.session.schoolId,
            isFirstLogin: true,
            createdBy: req.session.userId,
        });
        await sendWelcomeEmail({
            to: email, name, email, tempPassword, role: 'school_admin',
            schoolName: req.session.schoolName,
        });
        req.flash('success', `Co-Admin "${name}" created. Credentials sent to ${email}.`);
        res.redirect('/admin/admins');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to create admin: ' + err.message);
        res.redirect('/admin/admins/create');
    }
};

module.exports = {
    getDashboard, getTeachers, getCreateTeacher, postCreateTeacher,
    getStudents, getCreateStudent, postCreateStudent, deleteUser,
    getAdmins, getCreateAdmin, postCreateAdmin,
};
