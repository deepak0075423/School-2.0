const User = require('../models/User');
const School = require('../models/School');
const StudentProfile = require('../models/StudentProfile');
const ParentProfile = require('../models/ParentProfile');
const TeacherProfile = require('../models/TeacherProfile');
const bcrypt = require('bcryptjs');
const generatePassword = require('../utils/generatePassword');
const { sendWelcomeEmail } = require('../utils/sendEmail');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const Class = require('../models/Class');
const ClassSection = require('../models/ClassSection');

// Dashboard
const getDashboard = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const teachers = await User.countDocuments({ role: 'teacher', school: schoolId });
        const students = await User.countDocuments({ role: 'student', school: schoolId });
        const parents = await User.countDocuments({ role: 'parent', school: schoolId });
        const classes = await Class.countDocuments({ school: schoolId, status: 'active' });
        const sections = await ClassSection.countDocuments({ school: schoolId, status: 'active' });
        const recentUsers = await User.find({ school: schoolId, role: { $nin: ['super_admin', 'school_admin'] } })
            .sort({ createdAt: -1 }).limit(5);

        res.render('admin/dashboard', {
            title: 'School Admin Dashboard',
            layout: 'layouts/main',
            stats: { teachers, students, parents, classes, sections },
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
        const { name, email, phone, subjects, classes, qualification, experience, employeeId, gender, dob, joiningDate, designation, department } = req.body;
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
            employeeId: employeeId || '',
            gender: gender || '',
            dob: dob || null,
            joiningDate: joiningDate || null,
            designation: designation || '',
            department: department || '',
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

const postBulkTeachers = async (req, res) => {
    try {
        if (!req.file) {
            req.flash('error', 'Please upload a valid Excel file.');
            return res.redirect('/admin/teachers/create');
        }

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        if (data.length === 0) {
            req.flash('error', 'The uploaded file is empty.');
            return res.redirect('/admin/teachers/create');
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
                    school: req.session.schoolId,
                    isFirstLogin: true,
                    createdBy: req.session.userId,
                });

                await TeacherProfile.create({
                    user: user._id,
                    school: req.session.schoolId,
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
                    schoolName: req.session.schoolName,
                }).catch(e => console.error('Failed to send email to', email, e));
                
                successCount++;
            } catch (err) {
                console.error('Error creating teacher from row', row, err);
                errorCount++;
                failedRows.push({ ...row, '__Error_Reason__': err.message || 'System Error' });
            }
        }

        let errorReportUrl = '';
        if (failedRows.length > 0) {
            const reportsDir = path.join(process.cwd(), 'public', 'reports');
            if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
            const reportFileName = `teacher-errors-${Date.now()}.xlsx`;
            const wb = xlsx.utils.book_new();
            const ws = xlsx.utils.json_to_sheet(failedRows);
            xlsx.utils.book_append_sheet(wb, ws, 'Failed Rows');
            xlsx.writeFile(wb, path.join(reportsDir, reportFileName));
            errorReportUrl = `/reports/${reportFileName}`;
        }

        let flashMsg = `Batch Completed: ${successCount} teachers created. ${errorCount} failed/skipped.`;
        if (errorReportUrl) flashMsg += ` <a href="${errorReportUrl}" target="_blank" style="text-decoration:underline;">Download Error Report</a>`;

        req.flash('success', flashMsg);
        res.redirect('/admin/teachers');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to process bulk upload: ' + err.message);
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
            studentDob, studentAddress, gender, bloodGroup, religion, category, admissionNumber, rollNumber,
            parentName, parentEmail, parentPhone, parentRelationship, fatherOccupation, motherOccupation, guardianOccupation, emergencyContact, annualIncome
        } = req.body;

        if (!fatherOccupation && !motherOccupation && !guardianOccupation) {
            req.flash('error', 'Please provide at least one occupation (Father, Mother, or Guardian).');
            return res.redirect('/admin/students/create');
        }

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

        await StudentProfile.create({
            user: studentUser._id,
            school: req.session.schoolId,
            gender: gender || '',
            bloodGroup: bloodGroup || '',
            religion: religion || '',
            category: category || '',
            admissionNumber: admissionNumber || '',
            rollNumber: rollNumber || '',
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
            fatherOccupation: fatherOccupation || '',
            motherOccupation: motherOccupation || '',
            guardianOccupation: guardianOccupation || '',
            emergencyContact: emergencyContact || '',
            annualIncome: annualIncome || '',
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

const postBulkStudents = async (req, res) => {
    try {
        if (!req.file) {
            req.flash('error', 'Please upload a valid Excel file.');
            return res.redirect('/admin/students/create');
        }

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        if (data.length === 0) {
            req.flash('error', 'The uploaded file is empty.');
            return res.redirect('/admin/students/create');
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
                        school: req.session.schoolId,
                        isFirstLogin: true, createdBy: req.session.userId,
                    });

                    await ParentProfile.create({
                        user: parentUser._id,
                        school: req.session.schoolId,
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
                        schoolName: req.session.schoolName,
                    }).catch(e => console.error(e));
                }

                const studentTempPass = generatePassword();
                const studentSalt = await bcrypt.genSalt(12);
                const studentUser = await User.create({
                    name: studentName, email: sEmailStr, phone: studentPhone ? studentPhone.toString() : '',
                    role: 'student', password: await bcrypt.hash(studentTempPass, studentSalt),
                    school: req.session.schoolId,
                    isFirstLogin: true, createdBy: req.session.userId,
                });

                await StudentProfile.create({
                    user: studentUser._id,
                    school: req.session.schoolId,
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
                    schoolName: req.session.schoolName,
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
            const reportFileName = `student-errors-${Date.now()}.xlsx`;
            const wb = xlsx.utils.book_new();
            const ws = xlsx.utils.json_to_sheet(failedRows);
            xlsx.utils.book_append_sheet(wb, ws, 'Failed Rows');
            xlsx.writeFile(wb, path.join(reportsDir, reportFileName));
            errorReportUrl = `/reports/${reportFileName}`;
        }

        let flashMsg = `Batch Completed: ${successCount} students created. ${errorCount} failed/skipped.`;
        if (errorReportUrl) flashMsg += ` <a href="${errorReportUrl}" target="_blank" style="text-decoration:underline;">Download Error Report</a>`;

        req.flash('success', flashMsg);
        res.redirect('/admin/students');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to process bulk upload: ' + err.message);
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

module.exports = {
    getDashboard, getTeachers, getCreateTeacher, postCreateTeacher, postBulkTeachers,
    getStudents, getCreateStudent, postCreateStudent, postBulkStudents, deleteUser,
    getAdmins, getCreateAdmin, postCreateAdmin, downloadTeacherTemplate, downloadStudentTemplate,
};
