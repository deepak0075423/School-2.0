const User = require('../models/User');
const School = require('../models/School');
const StudentProfile = require('../models/StudentProfile');
const ParentProfile = require('../models/ParentProfile');
const TeacherProfile = require('../models/TeacherProfile');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const generatePassword = require('../utils/generatePassword');
const { sendWelcomeEmail } = require('../utils/sendEmail');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

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
        if (role === 'teacher') await TeacherProfile.create({ user: user._id, school: school || null });
        if (role === 'student') await StudentProfile.create({ user: user._id, school: school || null });
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

const postBulkTeachers = async (req, res) => {
    try {
        const schoolId = req.body.school;
        if (!schoolId) {
            req.flash('error', 'Please select a school.');
            return res.redirect('/super-admin/users/create');
        }

        if (!req.file) {
            req.flash('error', 'Please upload a valid Excel file.');
            return res.redirect('/super-admin/users/create');
        }

        const schoolDoc = await School.findById(schoolId);
        if (!schoolDoc) {
            req.flash('error', 'Invalid school selected.');
            return res.redirect('/super-admin/users/create');
        }

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        if (data.length === 0) {
            req.flash('error', 'The uploaded file is empty.');
            return res.redirect('/super-admin/users/create');
        }

        let successCount = 0;
        let errorCount = 0;
        const failedRows = [];
        
        for (const row of data) {
            try {
                const name = row['Name'] || row['name'] || row['NAME'];
                const email = row['Email'] || row['email'] || row['EMAIL'];
                const phone = row['Phone'] || row['phone'] || row['PHONE'];
                const employeeId = row['Employee ID'] || row['employee id'] || row['EMPLOYEE ID'] || '';
                const gender = row['Gender'] || row['gender'] || row['GENDER'] || '';
                const dob = row['DOB'] || row['dob'] || null;
                const joiningDate = row['Joining Date'] || row['joining date'] || null;
                const designation = row['Designation'] || row['designation'] || '';
                const department = row['Department'] || row['department'] || '';
                const subjectsRaw = row['Subjects'] || row['subjects'] || row['SUBJECTS'] || '';
                const classesRaw = row['Classes'] || row['classes'] || row['CLASSES'] || '';
                const qualification = row['Qualification'] || row['qualification'] || '';
                const experience = row['Experience'] || row['experience'] || '';

                if (!name || !email) {
                    errorCount++;
                    failedRows.push({ ...row, '__Error_Reason__': 'Missing Name or Email' });
                    continue;
                }

                const existing = await User.findOne({ email: email.toString().toLowerCase() });
                if (existing) {
                    errorCount++;
                    failedRows.push({ ...row, '__Error_Reason__': 'Email already registered' });
                    continue;
                }

                const tempPassword = generatePassword();
                const salt = await bcrypt.genSalt(12);
                const user = await User.create({
                    name, email: email.toString().toLowerCase(), phone: phone ? phone.toString() : '', role: 'teacher',
                    password: await bcrypt.hash(tempPassword, salt),
                    school: schoolId,
                    isFirstLogin: true,
                    createdBy: req.session.userId,
                });

                await TeacherProfile.create({
                    user: user._id,
                    school: schoolId,
                    employeeId,
                    gender,
                    dob,
                    joiningDate,
                    designation,
                    department,
                    subjects: subjectsRaw ? subjectsRaw.toString().split(',').map(s => s.trim()) : [],
                    classes: classesRaw ? classesRaw.toString().split(',').map(c => c.trim()) : [],
                    qualification, experience,
                });

                sendWelcomeEmail({
                    to: email.toString().toLowerCase(), name, email: email.toString().toLowerCase(), tempPassword, role: 'teacher',
                    schoolName: schoolDoc.name,
                }).catch(e => console.error(e));
                
                successCount++;
            } catch (err) {
                console.error(err);
                errorCount++;
                failedRows.push({ ...row, '__Error_Reason__': err.message || 'System Error' });
            }
        }

        let errorReportUrl = '';
        if (failedRows.length > 0) {
            const reportsDir = path.join(process.cwd(), 'public', 'reports');
            if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
            const reportFileName = `super-teacher-errors-${Date.now()}.xlsx`;
            const wb = xlsx.utils.book_new();
            const ws = xlsx.utils.json_to_sheet(failedRows);
            xlsx.utils.book_append_sheet(wb, ws, 'Failed Rows');
            xlsx.writeFile(wb, path.join(reportsDir, reportFileName));
            errorReportUrl = `/reports/${reportFileName}`;
        }

        let flashMsg = `Batch Completed: ${successCount} teachers created in ${schoolDoc.name}. ${errorCount} failed/skipped.`;
        if (errorReportUrl) flashMsg += ` <a href="${errorReportUrl}" target="_blank" style="text-decoration:underline;">Download Error Report</a>`;

        req.flash('success', flashMsg);
        res.redirect('/super-admin/users');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Bulk upload failed: ' + err.message);
        res.redirect('/super-admin/users/create');
    }
};

const postBulkStudents = async (req, res) => {
    try {
        const schoolId = req.body.school;
        if (!schoolId) {
            req.flash('error', 'Please select a school.');
            return res.redirect('/super-admin/users/create');
        }

        if (!req.file) {
            req.flash('error', 'Please upload a valid Excel file.');
            return res.redirect('/super-admin/users/create');
        }

        const schoolDoc = await School.findById(schoolId);
        if (!schoolDoc) {
            req.flash('error', 'Invalid school selected.');
            return res.redirect('/super-admin/users/create');
        }

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        if (data.length === 0) {
            req.flash('error', 'The uploaded file is empty.');
            return res.redirect('/super-admin/users/create');
        }

        let successCount = 0;
        let errorCount = 0;
        const failedRows = [];

        for (const row of data) {
            try {
                const studentName = row['Student Name'] || row['student name'] || row['STUDENT NAME'];
                const studentEmail = row['Student Email'] || row['student email'] || row['STUDENT EMAIL'];
                const studentPhone = row['Student Phone'] || row['student phone'] || row['STUDENT PHONE'];
                const studentClass = row['Class'] || row['class'] || row['CLASS'];
                const studentSection = row['Section'] || row['section'] || row['SECTION'] || '';
                const studentDob = row['DOB'] || row['dob'] || row['DOB'] || null;
                const studentAddress = row['Address'] || row['address'] || row['ADDRESS'] || '';

                const gender = row['Gender'] || row['gender'] || row['GENDER'] || '';
                const bloodGroup = row['Blood Group'] || row['blood group'] || '';
                const religion = row['Religion'] || row['religion'] || '';
                const category = row['Category'] || row['category'] || '';
                const admissionNumber = row['Admission Number'] || row['admission number'] || '';
                const rollNumber = row['Roll Number'] || row['roll number'] || '';

                const parentName = row['Parent Name'] || row['parent name'] || row['PARENT NAME'];
                const parentEmail = row['Parent Email'] || row['parent email'] || row['PARENT EMAIL'];
                const parentPhone = row['Parent Phone'] || row['parent phone'] || row['PARENT PHONE'];
                const parentRelationship = row['Parent Relationship'] || row['parent relationship'] || 'Guardian';
                const fatherOccupation = row['Father Occupation'] || row['father occupation'] || '';
                const motherOccupation = row['Mother Occupation'] || row['mother occupation'] || '';
                const guardianOccupation = row['Guardian Occupation'] || row['guardian occupation'] || '';
                const emergencyContact = row['Emergency Contact'] || row['emergency contact'] || '';
                const annualIncome = row['Annual Income'] || row['annual income'] || '';

                if (!studentName || !studentEmail || !parentName || !parentEmail) {
                    errorCount++;
                    failedRows.push({ ...row, '__Error_Reason__': 'Missing required Student/Parent Name or Email' });
                    continue;
                }

                if (!fatherOccupation && !motherOccupation && !guardianOccupation) {
                    errorCount++;
                    failedRows.push({ ...row, '__Error_Reason__': 'Missing Occupation (at least one is required)' });
                    continue;
                }

                const sEmailStr = studentEmail.toString().toLowerCase();
                const pEmailStr = parentEmail.toString().toLowerCase();

                const existingStudent = await User.findOne({ email: sEmailStr });
                let parentUser = await User.findOne({ email: pEmailStr });

                if (existingStudent) {
                    errorCount++;
                    failedRows.push({ ...row, '__Error_Reason__': 'Student Email already registered' });
                    continue;
                }

                if (!parentUser) {
                    const parentTempPass = generatePassword();
                    const parentSalt = await bcrypt.genSalt(12);
                    parentUser = await User.create({
                        name: parentName, email: pEmailStr, phone: parentPhone ? parentPhone.toString() : '',
                        role: 'parent', password: await bcrypt.hash(parentTempPass, parentSalt),
                        school: schoolId,
                        isFirstLogin: true, createdBy: req.session.userId,
                    });

                    await ParentProfile.create({
                        user: parentUser._id,
                        school: schoolId,
                        relationship: parentRelationship,
                        fatherOccupation,
                        motherOccupation,
                        guardianOccupation,
                        emergencyContact,
                        annualIncome,
                        children: [],
                    });

                    sendWelcomeEmail({
                        to: pEmailStr, name: parentName, email: pEmailStr,
                        tempPassword: parentTempPass, role: 'parent',
                        schoolName: schoolDoc.name,
                    }).catch(e => console.error(e));
                }

                const studentTempPass = generatePassword();
                const studentSalt = await bcrypt.genSalt(12);
                const studentUser = await User.create({
                    name: studentName, email: sEmailStr, phone: studentPhone ? studentPhone.toString() : '',
                    role: 'student', password: await bcrypt.hash(studentTempPass, studentSalt),
                    school: schoolId,
                    isFirstLogin: true, createdBy: req.session.userId,
                });

                await StudentProfile.create({
                    user: studentUser._id,
                    school: schoolId,
                    gender, bloodGroup, religion, category, admissionNumber, rollNumber,
                    class: studentClass ? studentClass.toString() : '',
                    section: studentSection ? studentSection.toString() : '',
                    dob: studentDob,
                    address: studentAddress,
                    parent: parentUser._id,
                });

                await ParentProfile.updateOne(
                    { user: parentUser._id },
                    { $addToSet: { children: studentUser._id } }
                );

                sendWelcomeEmail({
                    to: sEmailStr, name: studentName, email: sEmailStr,
                    tempPassword: studentTempPass, role: 'student',
                    schoolName: schoolDoc.name,
                }).catch(e => console.error(e));

                successCount++;
            } catch (err) {
                console.error('Error in student bulk row', row, err);
                errorCount++;
                failedRows.push({ ...row, '__Error_Reason__': err.message || 'System Error' });
            }
        }

        let errorReportUrl = '';
        if (failedRows.length > 0) {
            const reportsDir = path.join(process.cwd(), 'public', 'reports');
            if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
            const reportFileName = `super-student-errors-${Date.now()}.xlsx`;
            const wb = xlsx.utils.book_new();
            const ws = xlsx.utils.json_to_sheet(failedRows);
            xlsx.utils.book_append_sheet(wb, ws, 'Failed Rows');
            xlsx.writeFile(wb, path.join(reportsDir, reportFileName));
            errorReportUrl = `/reports/${reportFileName}`;
        }

        let flashMsg = `Batch Completed: ${successCount} students created in ${schoolDoc.name}. ${errorCount} failed/skipped.`;
        if (errorReportUrl) flashMsg += ` <a href="${errorReportUrl}" target="_blank" style="text-decoration:underline;">Download Error Report</a>`;

        req.flash('success', flashMsg);
        res.redirect('/super-admin/users');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to process bulk upload: ' + err.message);
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
    try {
        const user = await User.findById(req.params.id);
        if (user) {
            if (user.role === 'super_admin') {
                req.flash('error', 'Super Admin accounts cannot be deleted.');
                const returnUrl = req.body.returnUrl || 'back';
                return res.redirect(returnUrl);
            }
            
            // Cascade delete specific profile based on role
            if (user.role === 'student') {
                await StudentProfile.findOneAndDelete({ user: user._id });
                await ParentProfile.updateMany({ children: user._id }, { $pull: { children: user._id } });
            }
            if (user.role === 'teacher') await TeacherProfile.findOneAndDelete({ user: user._id });
            if (user.role === 'parent') await ParentProfile.findOneAndDelete({ user: user._id });

            // Delete user document
            await User.findByIdAndDelete(req.params.id);
            req.flash('success', 'User deleted successfully.');
        } else {
            req.flash('error', 'User not found.');
        }
    } catch (err) {
        console.error('Error deleting user:', err);
        req.flash('error', 'Failed to delete user.');
    }
    const returnUrl = req.body.returnUrl || 'back';
    res.redirect(returnUrl);
};

// Bulk delete selected users
const postBulkDeleteUsers = async (req, res) => {
    try {
        let userIds = req.body.userIds;
        if (!userIds || userIds.length === 0) {
            req.flash('error', 'No users selected for deletion.');
            return res.redirect('back');
        }

        // Ensure userIds is an array
        if (!Array.isArray(userIds)) {
            userIds = [userIds];
        }

        let deleteCount = 0;
        let skippedSuperAdmins = 0;

        for (const id of userIds) {
            const user = await User.findById(id);
            if (user) {
                if (user.role === 'super_admin') {
                    skippedSuperAdmins++;
                    continue;
                }
                
                if (user.role === 'student') {
                    await StudentProfile.findOneAndDelete({ user: user._id });
                    await ParentProfile.updateMany({ children: user._id }, { $pull: { children: user._id } });
                }
                if (user.role === 'teacher') await TeacherProfile.findOneAndDelete({ user: user._id });
                if (user.role === 'parent') await ParentProfile.findOneAndDelete({ user: user._id });

                await User.findByIdAndDelete(id);
                deleteCount++;
            }
        }

        if (skippedSuperAdmins > 0) {
            req.flash('success', `Deleted ${deleteCount} user(s). Skipped ${skippedSuperAdmins} Super Admin(s).`);
        } else {
            req.flash('success', `Successfully deleted ${deleteCount} user(s).`);
        }
    } catch (err) {
        console.error('Error in bulk delete:', err);
        req.flash('error', 'Failed to bulk delete users.');
    }
    const returnUrl = req.body.returnUrl || 'back';
    res.redirect(returnUrl);
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

const getUsers = async (req, res) => {
    try {
        const { role, school, search } = req.query;
        let query = {};
        if (role) query.role = role;
        if (school) query.school = school;
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        const users = await User.find(query).populate('school').sort('-createdAt');
        const schools = await School.find();
        res.render('superAdmin/users', { 
            users, 
            schools,
            title: 'Manage Users',
            query: req.query 
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load users.');
        res.redirect('/super-admin/dashboard');
    }
};

const getEditUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).populate('school');
        if (!user) {
            req.flash('error', 'User not found.');
            return res.redirect('/super-admin/users');
        }
        const schools = await School.find();
        let profile = null;
        if (user.role === 'teacher') {
            profile = await TeacherProfile.findOne({ user: user._id });
            if (!profile) profile = await TeacherProfile.create({ user: user._id, school: user.school?._id || user.school });
        }
        if (user.role === 'student') {
            profile = await StudentProfile.findOne({ user: user._id });
            if (!profile) profile = await StudentProfile.create({ user: user._id, school: user.school?._id || user.school });
        }
        res.render('superAdmin/editUser', { title: 'Edit User', user, schools, profile });
    } catch (err) {
        req.flash('error', 'Error loading user.');
        res.redirect('/super-admin/users');
    }
};

const postEditUser = async (req, res) => {
    try {
        const { name, email, phone, school, ...profileData } = req.body;
        const user = await User.findById(req.params.id);
        await User.findByIdAndUpdate(req.params.id, { name, email, phone, school });
        if (user && user.role === 'teacher') {
            if (profileData.subjects) profileData.subjects = profileData.subjects.split(',').map(s => s.trim()).filter(Boolean);
            if (profileData.classes) profileData.classes = profileData.classes.split(',').map(c => c.trim()).filter(Boolean);
            await TeacherProfile.findOneAndUpdate({ user: user._id }, profileData);
        }
        if (user && user.role === 'student') {
            await StudentProfile.findOneAndUpdate({ user: user._id }, profileData);
        }
        req.flash('success', 'User updated successfully.');
        res.redirect('/super-admin/users');
    } catch (err) {
        req.flash('error', 'Failed to update user.');
        res.redirect(`/super-admin/users/edit/${req.params.id}`);
    }
};

const downloadTeacherTemplate = (req, res) => {
    const headers = [['Name', 'Email', 'Phone', 'Employee ID', 'Gender', 'DOB', 'Joining Date', 'Designation', 'Department', 'Subjects', 'Classes', 'Qualification', 'Experience']];
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet(headers);
    xlsx.utils.book_append_sheet(wb, ws, 'Teachers');
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="teacher-template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
};

const downloadStudentTemplate = (req, res) => {
    const headers = [['Student Name', 'Student Email', 'Student Phone', 'Gender', 'DOB', 'Blood Group', 'Religion', 'Category', 'Admission Number', 'Roll Number', 'Class', 'Section', 'Address', 'Parent Name', 'Parent Email', 'Parent Phone', 'Parent Relationship', 'Father Occupation', 'Mother Occupation', 'Guardian Occupation', 'Emergency Contact', 'Annual Income']];
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet(headers);
    xlsx.utils.book_append_sheet(wb, ws, 'Students');
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="student-template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
};

/* ─────────────────────────────────────────────
   MODULE PERMISSIONS
─────────────────────────────────────────────── */

// All known modules with their display metadata
const ALL_MODULES = [
    { key: 'attendance',   label: 'Attendance Management', icon: '📋', description: 'Student & teacher attendance tracking, calendars, correction requests, regularisation, parent notifications.' },
    { key: 'notification', label: 'Notification Module',   icon: '🔔', description: 'In-app and email notifications from school admin and teachers to students, parents, and staff.' },
    { key: 'aptitudeExam', label: 'Aptitude Exam Module',  icon: '📝', description: 'Role-based aptitude exams with randomized questions, anti-cheating, auto-evaluation, analytics, and result approval workflow.' },
    { key: 'result',       label: 'Result & Assessment Management', icon: '📊', description: 'Formal exam result management (Mid Term, Final, Unit Test) with multi-level approval workflow, class test tracking, grade computation, and role-based result visibility.' },
    { key: 'timetable',    label: 'Timetable Management',  icon: '📅', description: 'Class section timetable configuration, period-wise subject and teacher assignment, section merging, and PDF download.' },
    { key: 'holiday',      label: 'Holiday Management',    icon: '🎉', description: 'Manage school holidays with type classification, applicability rules, recurring flags, and automatic in-app notifications.' },
    { key: 'leave',        label: 'Leave Management',      icon: '🏖️', description: 'Teacher leave applications with configurable leave types, balance tracking, approval workflow, calendar view, and reports.' },
    { key: 'document',     label: 'Document Sharing',      icon: '📄', description: 'Upload and share documents (PDFs, Word, Excel, Images) with the school, classes, or sections. Supports assignment submissions, version control, and audit logs.' },
    { key: 'library',      label: 'Library Management',    icon: '📚', description: 'Full library system: book catalogue, physical copy tracking with unique barcodes, issue/return/renewal, FIFO reservation queue, fine management, and audit log.' },
    { key: 'payroll',      label: 'Payroll Management',    icon: '💰', description: 'Employee salary structures, monthly payroll runs, approval workflow (Draft → Reviewed → Approved → Published), payslip generation with PDF download, and department-wise reports.' },
    { key: 'fees',         label: 'Fees Management',       icon: '💳', description: 'School-configurable fee heads, class/section fee structures, fine rules, concession templates, student-level ledger, payment collection with PDF receipts, collection and dues reports.' },
    { key: 'chat',         label: 'Chat Management',       icon: '💬', description: 'Real-time chat functionality for communication between students, parents, and staff.' },
];

const getPermissions = async (req, res) => {
    try {
        const schools = await School.find().sort({ name: 1 });
        res.render('superAdmin/permissions', {
            title: 'Module Permissions',
            layout: 'layouts/main',
            schools,
            allModules: ALL_MODULES,
        });
    } catch (err) {
        req.flash('error', 'Failed to load permissions: ' + err.message);
        res.redirect('/super-admin/dashboard');
    }
};

const postUpdatePermissions = async (req, res) => {
    try {
        const { schoolId, modules } = req.body;
        // modules arrives as an object: { attendance: 'on', ... } — only checked boxes appear

        const school = await School.findById(schoolId);
        if (!school) {
            req.flash('error', 'School not found.');
            return res.redirect('/super-admin/permissions');
        }

        // Build the update: each known module is set to true if present in body, false otherwise
        const moduleUpdate = {};
        ALL_MODULES.forEach(({ key }) => {
            moduleUpdate[`modules.${key}`] = !!(modules && modules[key] === 'on');
        });

        await School.findByIdAndUpdate(schoolId, { $set: moduleUpdate });

        req.flash('success', `Module permissions updated for "${school.name}".`);
        res.redirect('/super-admin/permissions');
    } catch (err) {
        req.flash('error', 'Failed to update permissions: ' + err.message);
        res.redirect('/super-admin/permissions');
    }
};

const postBulkUpdatePermissions = async (req, res) => {
    try {
        // action = 'enable-all' | 'disable-all', module = 'attendance'
        const { action, module: moduleName } = req.body;

        const knownModule = ALL_MODULES.find(m => m.key === moduleName);
        if (!knownModule) {
            req.flash('error', 'Unknown module.');
            return res.redirect('/super-admin/permissions');
        }

        const enable = action === 'enable-all';
        await School.updateMany({}, { $set: { [`modules.${moduleName}`]: enable } });

        req.flash('success', `"${knownModule.label}" ${enable ? 'enabled' : 'disabled'} for all schools.`);
        res.redirect('/super-admin/permissions');
    } catch (err) {
        req.flash('error', 'Bulk update failed: ' + err.message);
        res.redirect('/super-admin/permissions');
    }
};

module.exports = {
    getDashboard, getSchools, getCreateSchool, postCreateSchool, deleteSchool,
    getUsers, getCreateUser, postCreateUser, toggleUserStatus, deleteUser, postBulkDeleteUsers,
    postGenerateLoginLink, postBulkTeachers, postBulkStudents, downloadTeacherTemplate, downloadStudentTemplate,
    getPermissions, postUpdatePermissions, postBulkUpdatePermissions,
    getEditUser, postEditUser
};
