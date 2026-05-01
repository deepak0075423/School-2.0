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
const Holiday = require('../models/Holiday');

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

        const schoolModules = (req.user && req.user.school && req.user.school.modules) || {};
        let calendarHolidays = [], upcomingHolidays = [];
        if (schoolModules.holiday) {
            const now = new Date();
            const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            [calendarHolidays, upcomingHolidays] = await Promise.all([
                Holiday.find({ school: schoolId }).sort({ startDate: 1 }).lean(),
                Holiday.find({ school: schoolId, endDate: { $gte: now }, startDate: { $lte: in30Days } })
                    .sort({ startDate: 1 }).limit(5).lean(),
            ]);
        }

        res.render('admin/dashboard', {
            title: 'School Admin Dashboard',
            layout: 'layouts/main',
            stats: { teachers, students, parents, classes, sections },
            recentUsers,
            schoolName: req.session.schoolName,
            hasHoliday: !!schoolModules.holiday,
            calendarHolidays,
            upcomingHolidays,
            holidayViewUrl: '/admin/holidays',
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load dashboard.');
        res.redirect('/auth/login');
    }
};


// --- TEACHERS ---
const getTeachers = async (req, res) => {
    try {
        let query = { role: 'teacher', school: req.session.schoolId };
        if (req.query.search) {
            query.$or = [
                { name: { $regex: req.query.search, $options: 'i' } },
                { email: { $regex: req.query.search, $options: 'i' } }
            ];
        }
        const teachers = await User.find(query).sort('-createdAt');
        res.render('admin/teachers', { title: 'Manage Teachers', layout: 'layouts/main', teachers, query: req.query });
    } catch (err) {
        req.flash('error', 'Failed to load teachers.');
        res.redirect('/admin/dashboard');
    }
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
    try {
        let query = { role: 'student', school: req.session.schoolId };
        if (req.query.search) {
            query.$or = [
                { name: { $regex: req.query.search, $options: 'i' } },
                { email: { $regex: req.query.search, $options: 'i' } }
            ];
        }
        const studentProfiles = await StudentProfile.find({ school: req.session.schoolId })
            .populate({
                path: 'user',
                match: query
            })
            .populate('parent');

        const students = studentProfiles.filter(p => p.user);
        res.render('admin/students', { title: 'Manage Students', layout: 'layouts/main', students, query: req.query });
    } catch (err) {
        req.flash('error', 'Failed to load students.');
        res.redirect('/admin/dashboard');
    }
};

const getCreateStudent = (req, res) => {
    res.render('admin/createStudent', { title: 'Add Student', layout: 'layouts/main' });
};

const getParentLookup = async (req, res) => {
    try {
        const email = (req.query.email || '').toLowerCase().trim();
        if (!email) return res.json({ found: false });

        const user = await User.findOne({ email, role: 'parent', school: req.session.schoolId });
        if (!user) return res.json({ found: false });

        const profile = await ParentProfile.findOne({ user: user._id });
        return res.json({
            found: true,
            name: user.name,
            phone: user.phone || '',
            relationship: profile ? profile.relationship : 'Guardian',
            fatherOccupation: profile ? profile.fatherOccupation : '',
            motherOccupation: profile ? profile.motherOccupation : '',
            guardianOccupation: profile ? profile.guardianOccupation : '',
            emergencyContact: profile ? profile.emergencyContact : '',
            annualIncome: profile ? profile.annualIncome : '',
        });
    } catch (err) {
        res.json({ found: false });
    }
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

        // Check for existing student email
        const existingStudent = await User.findOne({ email: studentEmail.toLowerCase() });
        if (existingStudent) {
            req.flash('error', 'Student email already exists.');
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

        // Reuse existing parent account or create a new one
        let parentUser = await User.findOne({ email: parentEmail.toLowerCase(), role: 'parent' });
        let parentIsNew = false;
        let parentTempPass = null;
        if (!parentUser) {
            if (await User.findOne({ email: parentEmail.toLowerCase() })) {
                req.flash('error', 'That email is already registered under a different role (not parent).');
                await User.deleteOne({ _id: studentUser._id });
                return res.redirect('/admin/students/create');
            }
            parentTempPass = generatePassword();
            const parentSalt = await bcrypt.genSalt(12);
            parentUser = await User.create({
                name: parentName, email: parentEmail, phone: parentPhone,
                role: 'parent', password: await bcrypt.hash(parentTempPass, parentSalt),
                school: req.session.schoolId,
                isFirstLogin: true, createdBy: req.session.userId,
            });
            parentIsNew = true;
        }

        // Try to automatically assign section
        let matchedSectionId = null;
        if (studentClass && studentSection) {
            const AcademicYear = require('../models/AcademicYear');
            const Class = require('../models/Class');
            const ClassSection = require('../models/ClassSection');

            const activeYear = await AcademicYear.findOne({ school: req.session.schoolId, status: 'active' });
            if (activeYear) {
                const parsedNum = parseInt(studentClass);
                const classQuery = { school: req.session.schoolId, academicYear: activeYear._id, $or: [{ className: new RegExp('^' + studentClass + '$', 'i') }] };
                if (!isNaN(parsedNum)) classQuery.$or.push({ classNumber: parsedNum });

                const foundClass = await Class.findOne(classQuery);
                if (foundClass) {
                    const foundSec = await ClassSection.findOne({
                        school: req.session.schoolId,
                        class: foundClass._id,
                        sectionName: new RegExp('^' + studentSection.trim() + '$', 'i')
                    });
                    if (foundSec && foundSec.currentCount < foundSec.maxStudents) {
                        matchedSectionId = foundSec._id;
                    }
                }
            }
        }

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
            currentSection: matchedSectionId,
            dob: studentDob || null,
            address: studentAddress,
            parent: parentUser._id,
        });

        if (matchedSectionId) {
            const ClassSection = require('../models/ClassSection');
            const StudentSectionHistory = require('../models/StudentSectionHistory');
            await ClassSection.findByIdAndUpdate(matchedSectionId, {
                $inc: { currentCount: 1 },
                $addToSet: { enrolledStudents: studentUser._id }
            });
            await StudentSectionHistory.create({
                student: studentUser._id,
                oldSection: null,
                newSection: matchedSectionId,
                transferReason: 'Initial assignment upon creation',
                transferredBy: req.session.userId,
            });
        }

        if (parentIsNew) {
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
        } else {
            await ParentProfile.updateOne(
                { user: parentUser._id },
                { $addToSet: { children: studentUser._id } }
            );
        }

        // Send emails
        await sendWelcomeEmail({
            to: studentEmail, name: studentName, email: studentEmail,
            tempPassword: studentTempPass, role: 'student',
            schoolName: req.session.schoolName,
        });
        if (parentIsNew) {
            await sendWelcomeEmail({
                to: parentEmail, name: parentName, email: parentEmail,
                tempPassword: parentTempPass, role: 'parent',
                schoolName: req.session.schoolName,
            });
        }

        const msg = parentIsNew
            ? `Student "${studentName}" and Parent "${parentName}" accounts created. Credentials sent!`
            : `Student "${studentName}" created and linked to existing parent account "${parentUser.name}".`;
        req.flash('success', msg);
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

        // Pre-fetch academic year, classes, and sections to optimize bulk matching
        const AcademicYear = require('../models/AcademicYear');
        const Class = require('../models/Class');
        const ClassSection = require('../models/ClassSection');
        const StudentSectionHistory = require('../models/StudentSectionHistory');
        
        const activeYear = await AcademicYear.findOne({ school: req.session.schoolId, status: 'active' });
        let availableSections = [];
        let availableClasses = [];
        if (activeYear) {
            availableClasses = await Class.find({ school: req.session.schoolId, academicYear: activeYear._id });
            availableSections = await ClassSection.find({ school: req.session.schoolId, academicYear: activeYear._id });
        }

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

                // Section matching
                let matchedSectionId = null;
                if (studentClass && studentSection && activeYear) {
                    const parsedNum = parseInt(studentClass);
                    const isNum = !isNaN(parsedNum);
                    const sClassStr = studentClass.toString().trim().toLowerCase();
                    const sSectionStr = studentSection.toString().trim().toLowerCase();
                    
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
                            matchedSectionId = foundSec._id;
                            foundSec.currentCount++; // Optimistically increment in-memory
                        }
                    }
                }

                await StudentProfile.create({
                    user: studentUser._id,
                    school: req.session.schoolId,
                    gender, bloodGroup, religion, category, admissionNumber, rollNumber,
                    class: studentClass ? studentClass.toString() : '',
                    section: studentSection ? studentSection.toString() : '',
                    currentSection: matchedSectionId,
                    dob: studentDob,
                    address: studentAddress,
                    parent: parentUser._id,
                });

                if (matchedSectionId) {
                    await ClassSection.findByIdAndUpdate(matchedSectionId, { 
                        $inc: { currentCount: 1 },
                        $addToSet: { enrolledStudents: studentUser._id }
                    });
                    await StudentSectionHistory.create({
                        student: studentUser._id,
                        oldSection: null,
                        newSection: matchedSectionId,
                        transferReason: 'Bulk upload assignment',
                        transferredBy: req.session.userId,
                    });
                }

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
    try {
        const user = await User.findById(req.params.id);
        if (user && user.school.toString() === req.session.schoolId.toString()) {
            if (user.role === 'super_admin') {
                req.flash('error', 'Unauthorized deletion attempt.');
                const returnUrl = req.body.returnUrl || 'back';
                return res.redirect(returnUrl);
            }
            
            // Cascade delete based on role
            if (user.role === 'student') {
                await StudentProfile.findOneAndDelete({ user: user._id });
                await ParentProfile.updateMany({ children: user._id }, { $pull: { children: user._id } });
            }
            if (user.role === 'teacher') await TeacherProfile.findOneAndDelete({ user: user._id });
            if (user.role === 'parent') await ParentProfile.findOneAndDelete({ user: user._id });

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

const postBulkDeleteUsers = async (req, res) => {
    try {
        let userIds = req.body.userIds;
        if (!userIds || userIds.length === 0) {
            req.flash('error', 'No users selected for deletion.');
            return res.redirect('back');
        }

        if (!Array.isArray(userIds)) {
            userIds = [userIds];
        }

        let deleteCount = 0;
        let rejectCount = 0;

        for (const id of userIds) {
            const user = await User.findById(id);
            if (user && user.school.toString() === req.session.schoolId.toString()) {
                if (user.role === 'super_admin') {
                    rejectCount++;
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
            } else {
                rejectCount++;
            }
        }

        if (rejectCount > 0) {
            req.flash('success', `Deleted ${deleteCount} user(s). Rejected ${rejectCount} unauthorized/invalid ID(s).`);
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

// --- CO-ADMINS ---
const getAdmins = async (req, res) => {
    try {
        let query = { role: 'school_admin', school: req.session.schoolId };
        if (req.query.search) {
            query.$or = [
                { name: { $regex: req.query.search, $options: 'i' } },
                { email: { $regex: req.query.search, $options: 'i' } }
            ];
        }
        const admins = await User.find(query).sort('-createdAt');
        res.render('admin/admins', { title: 'Manage Co-Admins', layout: 'layouts/main', admins, query: req.query });
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

const getEditUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user || user.school.toString() !== req.session.schoolId.toString()) {
            req.flash('error', 'User not found.');
            return res.redirect('back');
        }
        let profile = null;
        let parentUser = null;
        let parentProfile = null;
        if (user.role === 'teacher') {
            profile = await TeacherProfile.findOne({ user: user._id });
            if (!profile) profile = await TeacherProfile.create({ user: user._id, school: user.school || req.session.schoolId });
        }
        if (user.role === 'student') {
            profile = await StudentProfile.findOne({ user: user._id });
            if (profile && profile.parent) {
                parentUser = await User.findById(profile.parent);
                parentProfile = await ParentProfile.findOne({ user: profile.parent });
            }
        }
        res.render('admin/editUser', { title: 'Edit User', layout: 'layouts/main', user, profile, parentUser, parentProfile });
    } catch (err) {
        req.flash('error', 'Error loading edit page.');
        res.redirect('back');
    }
};

const postEditUser = async (req, res) => {
    try {
        const { name, email, phone, ...profileData } = req.body;
        const user = await User.findById(req.params.id);
        if (!user || user.school.toString() !== req.session.schoolId.toString()) {
            req.flash('error', 'Unauthorized.');
            return res.redirect('back');
        }
        await User.findByIdAndUpdate(req.params.id, { name, email, phone });
        
        if (user.role === 'teacher') {
            if (profileData.subjects) profileData.subjects = profileData.subjects.split(',').map(s => s.trim()).filter(Boolean);
            if (profileData.classes) profileData.classes = profileData.classes.split(',').map(c => c.trim()).filter(Boolean);
            await TeacherProfile.findOneAndUpdate({ user: user._id }, profileData);
        }
        if (user.role === 'student') {
            const { parentName, parentEmail, parentPhone, parentRelationship, fatherOccupation, motherOccupation, guardianOccupation, annualIncome, emergencyContact, studentClass, studentSection, ...studentUpdates } = profileData;
            studentUpdates.class = studentClass;
            studentUpdates.section = studentSection;

            const studProf = await StudentProfile.findOneAndUpdate({ user: user._id }, studentUpdates);

            if (studProf && studProf.parent) {
                if (parentName || parentEmail || parentPhone) {
                    await User.findByIdAndUpdate(studProf.parent, {
                        name: parentName,
                        email: parentEmail,
                        phone: parentPhone
                    });
                }
                const pProfUpdate = {};
                if (parentRelationship) pProfUpdate.relationship = parentRelationship;
                if (fatherOccupation) pProfUpdate.fatherOccupation = fatherOccupation;
                if (motherOccupation) pProfUpdate.motherOccupation = motherOccupation;
                if (guardianOccupation) pProfUpdate.guardianOccupation = guardianOccupation;
                if (annualIncome) pProfUpdate.annualIncome = annualIncome;
                if (emergencyContact) pProfUpdate.emergencyContact = emergencyContact;
                
                await ParentProfile.findOneAndUpdate({ user: studProf.parent }, pProfUpdate);
            }
        }
        
        req.flash('success', 'User updated successfully.');
        res.redirect('/admin/teachers');
    } catch (err) {
        req.flash('error', 'Update failed.');
        res.redirect('back');
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
    getDashboard,    getTeachers,
    getCreateTeacher,
    postCreateTeacher,

    getStudents,
    getCreateStudent,
    getParentLookup,
    postCreateStudent,

    getAdmins,
    getCreateAdmin,
    postCreateAdmin,

    deleteUser,
    postBulkDeleteUsers,
    
    getEditUser,
    postEditUser,

    postBulkTeachers,
    postBulkStudents,
    downloadTeacherTemplate,
    downloadStudentTemplate
};
