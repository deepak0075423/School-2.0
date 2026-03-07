const User = require('../models/User');
const School = require('../models/School');
const StudentProfile = require('../models/StudentProfile');
const ParentProfile = require('../models/ParentProfile');
const TeacherProfile = require('../models/TeacherProfile');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const generatePassword = require('../utils/generatePassword');
const { sendWelcomeEmail } = require('../utils/sendEmail');

// Dashboard
const getDashboard = async (req, res) => {
    try {
        const schools = await School.countDocuments();
        const users = await User.countDocuments({ role: { $ne: 'super_admin' } });
        const admins = await User.countDocuments({ role: 'school_admin' });
        const teachers = await User.countDocuments({ role: 'teacher' });
        const students = await User.countDocuments({ role: 'student' });
        const parents = await User.countDocuments({ role: 'parent' });
        const recentUsers = await User.find({ role: { $ne: 'super_admin' } })
            .populate('school')
            .sort({ createdAt: -1 })
            .limit(5);

        res.render('superAdmin/dashboard', {
            title: 'Super Admin Dashboard',
            layout: 'layouts/main',
            stats: { schools, users, admins, teachers, students, parents },
            recentUsers,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load dashboard.');
        res.redirect('/auth/login');
    }
};

// --- SCHOOLS ---
const getSchools = async (req, res) => {
    const schools = await School.find().sort({ createdAt: -1 });
    res.render('superAdmin/schools', { title: 'All Schools', layout: 'layouts/main', schools });
};

const getCreateSchool = (req, res) => {
    res.render('superAdmin/createSchool', { title: 'Create School', layout: 'layouts/main' });
};

const postCreateSchool = async (req, res) => {
    try {
        const { name, address, email, phone, website } = req.body;
        await School.create({ name, address, email, phone, website });
        req.flash('success', `School "${name}" created successfully.`);
        res.redirect('/super-admin/schools');
    } catch (err) {
        req.flash('error', 'Failed to create school: ' + err.message);
        res.redirect('/super-admin/schools/create');
    }
};

const deleteSchool = async (req, res) => {
    await School.findByIdAndDelete(req.params.id);
    req.flash('success', 'School deleted.');
    res.redirect('/super-admin/schools');
};

// --- USERS ---
const getUsers = async (req, res) => {
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.school) filter.school = req.query.school;
    const users = await User.find(filter).populate('school').sort({ createdAt: -1 });
    const schools = await School.find();
    res.render('superAdmin/users', { title: 'All Users', layout: 'layouts/main', users, schools, query: req.query });
};

const getCreateUser = async (req, res) => {
    const schools = await School.find();
    res.render('superAdmin/createUser', { title: 'Create User', layout: 'layouts/main', schools });
};

const postCreateUser = async (req, res) => {
    try {
        const { name, email, phone, role, school } = req.body;
        const existing = await User.findOne({ email: email.toLowerCase() });
        if (existing) {
            req.flash('error', 'A user with this email already exists.');
            return res.redirect('/super-admin/users/create');
        }
        const tempPassword = generatePassword();
        const salt = await bcrypt.genSalt(12);
        const hashed = await bcrypt.hash(tempPassword, salt);
        const user = await User.create({
            name, email, phone, role,
            password: hashed,
            school: school || null,
            isFirstLogin: true,
            createdBy: req.session.userId,
        });
        const schoolDoc = school ? await School.findById(school) : null;
        await sendWelcomeEmail({
            to: email, name, email, tempPassword, role,
            schoolName: schoolDoc ? schoolDoc.name : null,
        });
        req.flash('success', `User "${name}" created. Login credentials sent to ${email}.`);
        res.redirect('/super-admin/users');
    } catch (err) {
        req.flash('error', 'Failed to create user: ' + err.message);
        res.redirect('/super-admin/users/create');
    }
};

const toggleUserStatus = async (req, res) => {
    const user = await User.findById(req.params.id);
    if (user) {
        await User.updateOne({ _id: user._id }, { $set: { isActive: !user.isActive } });
        req.flash('success', `User ${!user.isActive ? 'activated' : 'deactivated'}.`);
    }
    res.redirect('/super-admin/users');
};

const deleteUser = async (req, res) => {
    await User.findByIdAndDelete(req.params.id);
    req.flash('success', 'User deleted.');
    res.redirect('/super-admin/users');
};

// Generate a one-time magic login link for a specific user
const postGenerateLoginLink = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            req.flash('error', 'User not found.');
            return res.redirect('/super-admin/users');
        }

        // Generate a secure 32-byte hex token
        const token = crypto.randomBytes(32).toString('hex');
        const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

        await User.updateOne(
            { _id: user._id },
            { $set: { loginToken: token, loginTokenExpiry: expiry } }
        );

        const magicLink = `${process.env.APP_URL}/auth/magic/${token}`;

        // Re-fetch users list so we can re-render the page with the link displayed
        const filter = {};
        if (req.query.role) filter.role = req.query.role;
        const users = await User.find(filter).populate('school').sort({ createdAt: -1 });
        const schools = await School.find();

        res.render('superAdmin/users', {
            title: 'All Users',
            layout: 'layouts/main',
            users,
            schools,
            query: req.query,
            generatedLink: magicLink,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to generate login link.');
        res.redirect('/super-admin/users');
    }
};

module.exports = {
    getDashboard, getSchools, getCreateSchool, postCreateSchool, deleteSchool,
    getUsers, getCreateUser, postCreateUser, toggleUserStatus, deleteUser,
    postGenerateLoginLink,
};
