const path                  = require('path');
const fs                    = require('fs');
const Document              = require('../models/Document');
const DocumentVersion       = require('../models/DocumentVersion');
const AssignmentSubmission  = require('../models/AssignmentSubmission');
const User                  = require('../models/User');
const Class                 = require('../models/Class');
const ClassSection          = require('../models/ClassSection');
const SectionSubjectTeacher = require('../models/SectionSubjectTeacher');
const StudentProfile        = require('../models/StudentProfile');
const ParentProfile         = require('../models/ParentProfile');
const AcademicYear          = require('../models/AcademicYear');
const Notification          = require('../models/Notification');
const NotificationReceipt   = require('../models/NotificationReceipt');
const ActivityLog           = require('../models/ActivityLog');
const sseClients            = require('../utils/sseClients');

/* ─────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────── */

function fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function buildFileObjects(files) {
    return files.map(f => ({
        originalName: f.originalname,
        storedName:   f.filename,
        filePath:     '/uploads/documents/' + f.filename,
        mimeType:     f.mimetype,
        fileSize:     f.size,
    }));
}

function buildSubmissionFileObjects(files) {
    return files.map(f => ({
        originalName: f.originalname,
        storedName:   f.filename,
        filePath:     '/uploads/submissions/' + f.filename,
        mimeType:     f.mimetype,
        fileSize:     f.size,
    }));
}

async function notifyUsers(recipientIds, title, body, senderId, senderRole, schoolId) {
    if (!recipientIds || recipientIds.length === 0) return;
    try {
        const notif = await Notification.create({
            title,
            body,
            sender:     senderId,
            senderRole,
            school:     schoolId,
            channels:   { inApp: true, email: false },
            target:     { type: 'all' },
            recipientCount: recipientIds.length,
        });
        await NotificationReceipt.insertMany(
            recipientIds.map(rid => ({
                notification: notif._id,
                recipient:    rid,
                school:       schoolId,
            })),
            { ordered: false }
        );
        sseClients.pushMany(recipientIds, 'notification', {
            title,
            body,
            createdAt: notif.createdAt,
        });
    } catch (e) {
        console.error('notifyUsers error:', e.message);
    }
}

async function logAction(userId, schoolId, actionType, entityId, oldValue, newValue) {
    try {
        await ActivityLog.create({
            user:       userId,
            school:     schoolId,
            actionType,
            entityType: 'Document',
            entityId,
            oldValue,
            newValue,
        });
    } catch (e) { /* non-fatal */ }
}

// Resolve recipient user IDs from a document's target settings
async function resolveDocumentRecipients(doc) {
    const schoolId = doc.school;
    let userIds = [];

    switch (doc.targetType) {
        case 'whole_school':
            userIds = await User.find({ school: schoolId, isActive: true })
                .distinct('_id');
            break;
        case 'all_teachers':
            userIds = await User.find({ school: schoolId, role: 'teacher', isActive: true })
                .distinct('_id');
            break;
        case 'specific_teachers':
        case 'specific_teachers':
            userIds = doc.targetUsers.map(u => u.toString ? u : u);
            break;
        case 'class': {
            const sections = await ClassSection.find({ class: { $in: doc.targetClasses } })
                .distinct('_id');
            const profiles = await StudentProfile.find({ currentSection: { $in: sections } })
                .distinct('user');
            userIds = profiles;
            break;
        }
        case 'class_sections': {
            const profiles = await StudentProfile.find({ currentSection: { $in: doc.targetSections } })
                .distinct('user');
            userIds = profiles;
            break;
        }
        default:
            userIds = [];
    }
    return userIds;
}

// Determine if a given user can access a document
async function canAccessDocument(doc, userId, userRole, schoolId) {
    if (userRole === 'school_admin') return true;
    if (doc.uploadedBy.toString() === userId.toString()) return true;

    const uid = userId.toString();

    switch (doc.targetType) {
        case 'whole_school':
            return true;
        case 'all_teachers':
            return userRole === 'teacher';
        case 'specific_teachers':
            return doc.targetUsers.some(u => u.toString() === uid);
        case 'class': {
            if (userRole === 'teacher') {
                // teacher can access if they teach any section in those classes
                const sections = await ClassSection.find({ class: { $in: doc.targetClasses } }).select('_id').lean();
                const sids = sections.map(s => s._id);
                const entry = await SectionSubjectTeacher.findOne({ section: { $in: sids }, teacher: userId });
                if (entry) return true;
                const cs = await ClassSection.findOne({ class: { $in: doc.targetClasses }, $or: [{ classTeacher: userId }, { substituteTeacher: userId }] });
                return !!cs;
            }
            if (userRole === 'student') {
                const { classId } = await resolveStudentClassInfo(userId, schoolId);
                if (!classId) return false;
                return doc.targetClasses.some(c => c.toString() === classId.toString());
            }
            if (userRole === 'parent') {
                const parentProfile = await ParentProfile.findOne({ user: userId });
                if (!parentProfile) return false;
                for (const childId of parentProfile.children) {
                    const { classId } = await resolveStudentClassInfo(childId, schoolId);
                    if (classId && doc.targetClasses.some(c => c.toString() === classId.toString())) return true;
                }
            }
            return false;
        }
        case 'class_sections': {
            if (userRole === 'teacher') {
                const entry = await SectionSubjectTeacher.findOne({ section: { $in: doc.targetSections }, teacher: userId });
                if (entry) return true;
                const cs = await ClassSection.findOne({ _id: { $in: doc.targetSections }, $or: [{ classTeacher: userId }, { substituteTeacher: userId }] });
                return !!cs;
            }
            if (userRole === 'student') {
                const { sectionId } = await resolveStudentClassInfo(userId, schoolId);
                if (!sectionId) return false;
                return doc.targetSections.some(s => s.toString() === sectionId.toString());
            }
            if (userRole === 'parent') {
                const parentProfile = await ParentProfile.findOne({ user: userId });
                if (!parentProfile) return false;
                for (const childId of parentProfile.children) {
                    const { sectionId: childSectionId } = await resolveStudentClassInfo(childId, schoolId);
                    if (childSectionId && doc.targetSections.some(s => s.toString() === childSectionId.toString())) return true;
                }
            }
            return false;
        }
        default:
            return false;
    }
}

// Get sections a teacher is allowed to share with
async function getTeacherAllowedSections(teacherId, schoolId) {
    const activeAY = await AcademicYear.findOne({ school: schoolId, status: 'active' }).select('_id').lean();
    if (!activeAY) return [];

    const classTeacherSections = await ClassSection.find({
        school: schoolId,
        academicYear: activeAY._id,
        $or: [{ classTeacher: teacherId }, { substituteTeacher: teacherId }],
    }).populate('class', 'className classNumber').lean();

    const subjectAssignments = await SectionSubjectTeacher.find({ teacher: teacherId })
        .populate({ path: 'section', populate: { path: 'class', select: 'className classNumber' } })
        .lean();

    const sectionMap = new Map();

    for (const cs of classTeacherSections) {
        sectionMap.set(cs._id.toString(), { section: cs, isClassTeacher: true, subjects: [] });
    }
    for (const sa of subjectAssignments) {
        if (!sa.section) continue;
        const key = sa.section._id.toString();
        if (sectionMap.has(key)) {
            sectionMap.get(key).subjects.push(sa.subject);
        } else {
            sectionMap.set(key, { section: sa.section, isClassTeacher: false, subjects: [sa.subject] });
        }
    }

    return Array.from(sectionMap.values());
}

/* ─────────────────────────────────────────────────────────────
   ADMIN HANDLERS
───────────────────────────────────────────────────────────── */

exports.adminGetDocuments = async (req, res) => {
    try {
        const { category, search, archived } = req.query;
        const schoolId = req.session.schoolId;

        const filter = { school: schoolId };
        if (category) filter.category = category;
        if (search)   filter.title = { $regex: search, $options: 'i' };
        filter.isArchived = archived === '1';

        const docs = await Document.find(filter)
            .populate('uploadedBy', 'name role')
            .sort({ createdAt: -1 })
            .lean();

        const submissionCounts = {};
        for (const d of docs) {
            if (d.isAssignment) {
                submissionCounts[d._id] = await AssignmentSubmission.countDocuments({
                    document: d._id,
                    status: { $ne: 'pending' },
                });
            }
        }

        res.render('admin/documents/index', {
            title: 'Documents',
            layout: 'layouts/main',
            docs,
            submissionCounts,
            filters: { category: category || '', search: search || '', archived: archived || '0' },
            fmtSize,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load documents.');
        res.redirect('/admin/dashboard');
    }
};

exports.adminGetUploadForm = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const activeAY = await AcademicYear.findOne({ school: schoolId, status: 'active' }).select('_id').lean();

        const classes  = activeAY
            ? await Class.find({ school: schoolId, academicYear: activeAY._id }).sort('classNumber').lean()
            : [];
        const sections = activeAY
            ? await ClassSection.find({ school: schoolId, academicYear: activeAY._id })
                .populate('class', 'className classNumber').sort('sectionName').lean()
            : [];
        const teachers = await User.find({ school: schoolId, role: 'teacher', isActive: true })
            .select('name').sort('name').lean();

        // If editing an existing document, load it
        let editDoc = null;
        if (req.params.id) {
            editDoc = await Document.findOne({ _id: req.params.id, school: schoolId }).lean();
            if (!editDoc) {
                req.flash('error', 'Document not found.');
                return res.redirect('/admin/documents');
            }
        }

        res.render('admin/documents/upload', {
            title: editDoc ? 'Edit Document' : 'Upload Document',
            layout: 'layouts/main',
            classes,
            sections,
            teachers,
            editDoc,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load upload form.');
        res.redirect('/admin/documents');
    }
};

exports.adminPostUpload = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const {
            title, description, category, subject, tags,
            targetType, targetClasses, targetSections, targetUsers,
            isAssignment, dueDate, allowSubmission, marksEnabled, totalMarks,
        } = req.body;

        if (!req.files || req.files.length === 0) {
            req.flash('error', 'Please upload at least one file.');
            return res.redirect('/admin/documents/upload');
        }

        const fileObjects = buildFileObjects(req.files);

        const targetClassArr   = [].concat(targetClasses  || []).filter(Boolean);
        const targetSectionArr = [].concat(targetSections || []).filter(Boolean);
        const targetUserArr    = [].concat(targetUsers    || []).filter(Boolean);
        const tagArr           = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];

        if (targetType === 'class' && !targetClassArr.length) {
            req.flash('error', 'Please select at least one class.');
            return res.redirect('/admin/documents/upload');
        }
        if (targetType === 'class_sections' && !targetSectionArr.length) {
            req.flash('error', 'Please select at least one section.');
            return res.redirect('/admin/documents/upload');
        }
        if (targetType === 'specific_teachers' && !targetUserArr.length) {
            req.flash('error', 'Please select at least one teacher.');
            return res.redirect('/admin/documents/upload');
        }

        const doc = await Document.create({
            school:          schoolId,
            title:           title.trim(),
            description:     description || '',
            category,
            subject:         subject || '',
            tags:            tagArr,
            files:           fileObjects,
            currentVersion:  1,
            uploadedBy:      req.session.userId,
            uploaderRole:    'school_admin',
            targetType,
            targetClasses:   targetClassArr,
            targetSections:  targetSectionArr,
            targetUsers:     targetUserArr,
            isAssignment:    isAssignment === 'on' || isAssignment === 'true',
            dueDate:         dueDate || null,
            allowSubmission: allowSubmission !== 'off',
            marksEnabled:    marksEnabled === 'on' || marksEnabled === 'true',
            totalMarks:      totalMarks ? Number(totalMarks) : null,
        });

        // Save initial version snapshot
        await DocumentVersion.create({
            document:      doc._id,
            school:        schoolId,
            versionNumber: 1,
            files:         fileObjects,
            uploadedBy:    req.session.userId,
            changeNote:    'Initial upload',
        });

        // Notify recipients
        const recipients = await resolveDocumentRecipients(doc);
        if (recipients.length > 0) {
            const typeLabel = doc.isAssignment ? 'Assignment' : 'Document';
            await notifyUsers(
                recipients,
                `New ${typeLabel}: ${doc.title}`,
                `A new ${typeLabel.toLowerCase()} "${doc.title}" has been shared with you.`,
                req.session.userId,
                'school_admin',
                schoolId
            );
        }

        await logAction(req.session.userId, schoolId, 'UPLOAD_DOCUMENT', doc._id, null, { title: doc.title });
        req.flash('success', 'Document uploaded successfully.');
        res.redirect('/admin/documents');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Upload failed: ' + err.message);
        res.redirect('/admin/documents/upload');
    }
};

exports.adminGetDocument = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const doc = await Document.findOne({ _id: req.params.id, school: schoolId })
            .populate('uploadedBy', 'name role')
            .populate('targetClasses', 'className classNumber')
            .populate({ path: 'targetSections', populate: { path: 'class', select: 'className' } })
            .populate('targetUsers', 'name role')
            .lean();

        if (!doc) {
            req.flash('error', 'Document not found.');
            return res.redirect('/admin/documents');
        }

        const versions = await DocumentVersion.find({ document: doc._id })
            .populate('uploadedBy', 'name')
            .sort({ versionNumber: -1 }).lean();

        let submissions = [];
        let submissionStats = null;
        if (doc.isAssignment) {
            submissions = await AssignmentSubmission.find({ document: doc._id })
                .populate('student', 'name')
                .sort({ submittedAt: -1 }).lean();
            submissionStats = {
                total:     submissions.length,
                submitted: submissions.filter(s => s.status === 'submitted').length,
                late:      submissions.filter(s => s.status === 'late').length,
                pending:   submissions.filter(s => s.status === 'pending').length,
            };
        }

        const activeAY = await AcademicYear.findOne({ school: schoolId, status: 'active' }).select('_id').lean();
        const classes  = activeAY ? await Class.find({ school: schoolId, academicYear: activeAY._id }).sort('classNumber').lean() : [];
        const sections = activeAY
            ? await ClassSection.find({ school: schoolId, academicYear: activeAY._id })
                .populate('class', 'className classNumber').sort('sectionName').lean()
            : [];
        const teachers = await User.find({ school: schoolId, role: 'teacher', isActive: true })
            .select('name').sort('name').lean();

        res.render('admin/documents/detail', {
            title: doc.title,
            layout: 'layouts/main',
            doc,
            versions,
            submissions,
            submissionStats,
            classes,
            sections,
            teachers,
            fmtSize,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load document.');
        res.redirect('/admin/documents');
    }
};

exports.adminPostEditDocument = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const doc = await Document.findOne({ _id: req.params.id, school: schoolId });
        if (!doc) return res.status(404).json({ error: 'Not found' });

        const {
            title, description, category, subject, tags,
            targetType, targetClasses, targetSections, targetUsers,
            isAssignment, dueDate, allowSubmission, marksEnabled, totalMarks,
        } = req.body;

        const newClassArr   = [].concat(targetClasses  || []).filter(Boolean);
        const newSectionArr = [].concat(targetSections || []).filter(Boolean);
        const newUserArr    = [].concat(targetUsers    || []).filter(Boolean);

        if (targetType === 'class' && !newClassArr.length) {
            req.flash('error', 'Please select at least one class.');
            return res.redirect(`/admin/documents/${req.params.id}`);
        }
        if (targetType === 'class_sections' && !newSectionArr.length) {
            req.flash('error', 'Please select at least one section.');
            return res.redirect(`/admin/documents/${req.params.id}`);
        }
        if (targetType === 'specific_teachers' && !newUserArr.length) {
            req.flash('error', 'Please select at least one teacher.');
            return res.redirect(`/admin/documents/${req.params.id}`);
        }

        const oldTitle = doc.title;
        doc.title       = title.trim();
        doc.description = description || '';
        doc.category    = category;
        doc.subject     = subject || '';
        doc.tags        = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];
        doc.targetType  = targetType;
        doc.targetClasses  = newClassArr;
        doc.targetSections = newSectionArr;
        doc.targetUsers    = newUserArr;
        doc.isAssignment   = isAssignment === 'on' || isAssignment === 'true';
        doc.dueDate        = dueDate || null;
        doc.allowSubmission = allowSubmission !== 'off';
        doc.marksEnabled   = marksEnabled === 'on' || marksEnabled === 'true';
        doc.totalMarks     = totalMarks ? Number(totalMarks) : null;

        // If new files uploaded, bump version
        if (req.files && req.files.length > 0) {
            const newFiles = buildFileObjects(req.files);
            doc.currentVersion += 1;
            await DocumentVersion.create({
                document:      doc._id,
                school:        schoolId,
                versionNumber: doc.currentVersion,
                files:         newFiles,
                uploadedBy:    req.session.userId,
                changeNote:    req.body.changeNote || '',
            });
            doc.files = newFiles;
        }

        await doc.save();
        await logAction(req.session.userId, schoolId, 'EDIT_DOCUMENT', doc._id, { title: oldTitle }, { title: doc.title });
        req.flash('success', 'Document updated.');
        res.redirect(`/admin/documents/${doc._id}`);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Update failed: ' + err.message);
        res.redirect(`/admin/documents/${req.params.id}`);
    }
};

exports.adminPostDeleteDocument = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const doc = await Document.findOne({ _id: req.params.id, school: schoolId });
        if (!doc) {
            req.flash('error', 'Document not found.');
            return res.redirect('/admin/documents');
        }
        await DocumentVersion.deleteMany({ document: doc._id });
        await AssignmentSubmission.deleteMany({ document: doc._id });
        await Document.deleteOne({ _id: doc._id });
        await logAction(req.session.userId, schoolId, 'DELETE_DOCUMENT', doc._id, { title: doc.title }, null);
        req.flash('success', 'Document deleted.');
        res.redirect('/admin/documents');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Delete failed.');
        res.redirect('/admin/documents');
    }
};

exports.adminPostArchiveDocument = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const doc = await Document.findOne({ _id: req.params.id, school: schoolId });
        if (!doc) return res.status(404).json({ error: 'Not found' });
        doc.isArchived = !doc.isArchived;
        await doc.save();
        req.flash('success', doc.isArchived ? 'Document archived.' : 'Document restored.');
        res.redirect('/admin/documents');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Action failed.');
        res.redirect('/admin/documents');
    }
};

exports.adminPostRestoreVersion = async (req, res) => {
    try {
        const schoolId  = req.session.schoolId;
        const { docId, versionId } = req.params;

        const doc = await Document.findOne({ _id: docId, school: schoolId });
        const ver = await DocumentVersion.findOne({ _id: versionId, document: docId });
        if (!doc || !ver) {
            req.flash('error', 'Not found.');
            return res.redirect(`/admin/documents/${docId}`);
        }

        // Save current as a new version first
        doc.currentVersion += 1;
        await DocumentVersion.create({
            document:      doc._id,
            school:        schoolId,
            versionNumber: doc.currentVersion,
            files:         doc.files,
            uploadedBy:    req.session.userId,
            changeNote:    `Auto-saved before restoring v${ver.versionNumber}`,
        });

        doc.files = ver.files;
        await doc.save();
        await logAction(req.session.userId, schoolId, 'RESTORE_VERSION', doc._id, null, { restoredVersion: ver.versionNumber });
        req.flash('success', `Restored to version ${ver.versionNumber}.`);
        res.redirect(`/admin/documents/${docId}`);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Restore failed.');
        res.redirect(`/admin/documents/${req.params.docId}`);
    }
};

exports.adminGetAuditLog = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const logs = await ActivityLog.find({ school: schoolId, entityType: 'Document' })
            .populate('user', 'name role')
            .sort({ createdAt: -1 })
            .limit(500)
            .lean();

        res.render('admin/documents/audit', {
            title: 'Document Audit Log',
            layout: 'layouts/main',
            logs,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load audit log.');
        res.redirect('/admin/documents');
    }
};

// Bulk archive
exports.adminPostBulkArchive = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const ids = [].concat(req.body.ids || []);
        await Document.updateMany({ _id: { $in: ids }, school: schoolId }, { isArchived: true });
        req.flash('success', `${ids.length} document(s) archived.`);
        res.redirect('/admin/documents');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Bulk archive failed.');
        res.redirect('/admin/documents');
    }
};

exports.adminPostBulkDelete = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const ids = [].concat(req.body.ids || []);
        await DocumentVersion.deleteMany({ document: { $in: ids } });
        await AssignmentSubmission.deleteMany({ document: { $in: ids } });
        await Document.deleteMany({ _id: { $in: ids }, school: schoolId });
        req.flash('success', `${ids.length} document(s) deleted.`);
        res.redirect('/admin/documents');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Bulk delete failed.');
        res.redirect('/admin/documents');
    }
};

/* ─────────────────────────────────────────────────────────────
   TEACHER HANDLERS
───────────────────────────────────────────────────────────── */

exports.teacherGetDocuments = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const userId   = req.session.userId;
        const { category, search, tab } = req.query;
        const activeTab = tab || 'shared';

        // Documents the teacher uploaded
        const myFilter = { school: schoolId, uploadedBy: userId, isArchived: false };
        if (category) myFilter.category = category;
        if (search)   myFilter.title = { $regex: search, $options: 'i' };

        const myDocs = await Document.find(myFilter).sort({ createdAt: -1 }).lean();

        // Documents shared with the teacher (from admin to all_teachers / specific_teachers)
        const sharedFilter = {
            school:     schoolId,
            isArchived: false,
            $or: [
                { targetType: 'all_teachers' },
                { targetType: 'specific_teachers', targetUsers: userId },
                { targetType: 'whole_school' },
            ],
        };
        if (category) sharedFilter.category = category;
        if (search)   sharedFilter.title = { $regex: search, $options: 'i' };

        const sharedDocs = await Document.find(sharedFilter)
            .populate('uploadedBy', 'name role')
            .sort({ createdAt: -1 }).lean();

        const submissionCounts = {};
        for (const d of myDocs) {
            if (d.isAssignment) {
                submissionCounts[d._id] = await AssignmentSubmission.countDocuments({
                    document: d._id,
                    status: { $ne: 'pending' },
                });
            }
        }

        res.render('teacher/documents/index', {
            title: 'Documents',
            layout: 'layouts/main',
            myDocs,
            sharedDocs,
            submissionCounts,
            activeTab,
            filters: { category: category || '', search: search || '' },
            fmtSize,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load documents.');
        res.redirect('/teacher/dashboard');
    }
};

exports.teacherGetUploadForm = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const userId   = req.session.userId;
        const allowedSections = await getTeacherAllowedSections(userId, schoolId);

        let editDoc = null;
        if (req.params.id) {
            editDoc = await Document.findOne({ _id: req.params.id, school: schoolId, uploadedBy: userId }).lean();
            if (!editDoc) {
                req.flash('error', 'Document not found or access denied.');
                return res.redirect('/teacher/documents');
            }
        }

        res.render('teacher/documents/upload', {
            title: editDoc ? 'Edit Document' : 'Upload Document',
            layout: 'layouts/main',
            allowedSections,
            editDoc,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load upload form.');
        res.redirect('/teacher/documents');
    }
};

exports.teacherPostUpload = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const userId   = req.session.userId;

        if (!req.files || req.files.length === 0) {
            req.flash('error', 'Please upload at least one file.');
            return res.redirect('/teacher/documents/upload');
        }

        const {
            title, description, category, subject, tags,
            targetType, targetSections,
            isAssignment, dueDate, allowSubmission, marksEnabled, totalMarks,
        } = req.body;

        // Validate: teacher can only use section-based targets
        const allowedTypes = ['class_sections'];
        if (!allowedTypes.includes(targetType)) {
            req.flash('error', 'Invalid target type for teacher.');
            return res.redirect('/teacher/documents/upload');
        }

        // Verify teacher has access to all submitted sections
        const allowedSections = await getTeacherAllowedSections(userId, schoolId);
        const allowedSectionIds = allowedSections.map(s => s.section._id.toString());
        const requestedSections = [].concat(targetSections || []).filter(Boolean);

        for (const sid of requestedSections) {
            if (!allowedSectionIds.includes(sid)) {
                req.flash('error', 'Access denied: you are not assigned to one or more selected sections.');
                return res.redirect('/teacher/documents/upload');
            }
        }

        const fileObjects = buildFileObjects(req.files);
        const tagArr      = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];

        const doc = await Document.create({
            school:          schoolId,
            title:           title.trim(),
            description:     description || '',
            category,
            subject:         subject || '',
            tags:            tagArr,
            files:           fileObjects,
            currentVersion:  1,
            uploadedBy:      userId,
            uploaderRole:    'teacher',
            targetType,
            targetSections:  requestedSections,
            isAssignment:    isAssignment === 'on' || isAssignment === 'true',
            dueDate:         dueDate || null,
            allowSubmission: allowSubmission !== 'off',
            marksEnabled:    marksEnabled === 'on' || marksEnabled === 'true',
            totalMarks:      totalMarks ? Number(totalMarks) : null,
        });

        await DocumentVersion.create({
            document:      doc._id,
            school:        schoolId,
            versionNumber: 1,
            files:         fileObjects,
            uploadedBy:    userId,
            changeNote:    'Initial upload',
        });

        // Notify students in target sections
        const students = await StudentProfile.find({ currentSection: { $in: requestedSections } }).distinct('user');
        if (students.length > 0) {
            const typeLabel = doc.isAssignment ? 'Assignment' : 'Document';
            await notifyUsers(
                students,
                `New ${typeLabel}: ${doc.title}`,
                `Your teacher shared a new ${typeLabel.toLowerCase()} "${doc.title}".`,
                userId,
                'teacher',
                schoolId
            );
        }

        await logAction(userId, schoolId, 'UPLOAD_DOCUMENT', doc._id, null, { title: doc.title });
        req.flash('success', 'Document uploaded successfully.');
        res.redirect('/teacher/documents');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Upload failed: ' + err.message);
        res.redirect('/teacher/documents/upload');
    }
};

exports.teacherGetDocument = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const userId   = req.session.userId;

        const doc = await Document.findOne({ _id: req.params.id, school: schoolId })
            .populate('uploadedBy', 'name role')
            .populate({ path: 'targetSections', populate: { path: 'class', select: 'className' } })
            .lean();

        if (!doc) {
            req.flash('error', 'Document not found.');
            return res.redirect('/teacher/documents');
        }

        const accessible = await canAccessDocument(doc, userId, 'teacher', schoolId);
        if (!accessible) {
            req.flash('error', 'Access denied.');
            return res.redirect('/teacher/documents');
        }

        const isOwner = doc.uploadedBy._id.toString() === userId.toString();
        const versions = isOwner
            ? await DocumentVersion.find({ document: doc._id }).populate('uploadedBy', 'name').sort({ versionNumber: -1 }).lean()
            : [];

        let submissions = [];
        let submissionStats = null;
        if (doc.isAssignment && isOwner) {
            submissions = await AssignmentSubmission.find({ document: doc._id })
                .populate('student', 'name')
                .sort({ submittedAt: -1 }).lean();
            submissionStats = {
                total:     submissions.length,
                submitted: submissions.filter(s => s.status === 'submitted').length,
                late:      submissions.filter(s => s.status === 'late').length,
                pending:   submissions.filter(s => s.status === 'pending').length,
            };
        }

        const allowedSections = isOwner ? await getTeacherAllowedSections(userId, schoolId) : [];

        await logAction(userId, schoolId, 'VIEW_DOCUMENT', doc._id, null, null);

        res.render('teacher/documents/detail', {
            title: doc.title,
            layout: 'layouts/main',
            doc,
            isOwner,
            versions,
            submissions,
            submissionStats,
            allowedSections,
            fmtSize,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load document.');
        res.redirect('/teacher/documents');
    }
};

exports.teacherPostEditDocument = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const userId   = req.session.userId;

        const doc = await Document.findOne({ _id: req.params.id, school: schoolId, uploadedBy: userId });
        if (!doc) {
            req.flash('error', 'Not found or access denied.');
            return res.redirect('/teacher/documents');
        }

        const { title, description, category, subject, tags, targetSections,
                isAssignment, dueDate, allowSubmission, marksEnabled, totalMarks } = req.body;

        const allowedSections = await getTeacherAllowedSections(userId, schoolId);
        const allowedSectionIds = allowedSections.map(s => s.section._id.toString());
        const requestedSections = [].concat(targetSections || []).filter(Boolean);

        for (const sid of requestedSections) {
            if (!allowedSectionIds.includes(sid)) {
                req.flash('error', 'Access denied to one or more sections.');
                return res.redirect(`/teacher/documents/${doc._id}`);
            }
        }

        doc.title       = title.trim();
        doc.description = description || '';
        doc.category    = category;
        doc.subject     = subject || '';
        doc.tags        = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];
        doc.targetSections  = requestedSections;
        doc.isAssignment    = isAssignment === 'on' || isAssignment === 'true';
        doc.dueDate         = dueDate || null;
        doc.allowSubmission = allowSubmission !== 'off';
        doc.marksEnabled    = marksEnabled === 'on' || marksEnabled === 'true';
        doc.totalMarks      = totalMarks ? Number(totalMarks) : null;

        if (req.files && req.files.length > 0) {
            const newFiles = buildFileObjects(req.files);
            doc.currentVersion += 1;
            await DocumentVersion.create({
                document:      doc._id,
                school:        schoolId,
                versionNumber: doc.currentVersion,
                files:         newFiles,
                uploadedBy:    userId,
                changeNote:    req.body.changeNote || '',
            });
            doc.files = newFiles;
        }

        await doc.save();
        await logAction(userId, schoolId, 'EDIT_DOCUMENT', doc._id, null, { title: doc.title });
        req.flash('success', 'Document updated.');
        res.redirect(`/teacher/documents/${doc._id}`);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Update failed: ' + err.message);
        res.redirect(`/teacher/documents/${req.params.id}`);
    }
};

exports.teacherPostDeleteDocument = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const userId   = req.session.userId;
        const doc = await Document.findOne({ _id: req.params.id, school: schoolId, uploadedBy: userId });
        if (!doc) {
            req.flash('error', 'Not found or access denied.');
            return res.redirect('/teacher/documents');
        }
        await DocumentVersion.deleteMany({ document: doc._id });
        await AssignmentSubmission.deleteMany({ document: doc._id });
        await Document.deleteOne({ _id: doc._id });
        await logAction(userId, schoolId, 'DELETE_DOCUMENT', doc._id, { title: doc.title }, null);
        req.flash('success', 'Document deleted.');
        res.redirect('/teacher/documents');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Delete failed.');
        res.redirect('/teacher/documents');
    }
};

exports.teacherGetSubmissions = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const userId   = req.session.userId;

        const doc = await Document.findOne({ _id: req.params.id, school: schoolId, uploadedBy: userId }).lean();
        if (!doc || !doc.isAssignment) {
            req.flash('error', 'Assignment not found.');
            return res.redirect('/teacher/documents');
        }

        const submissions = await AssignmentSubmission.find({ document: doc._id })
            .populate('student', 'name email')
            .populate('reviewedBy', 'name')
            .sort({ submittedAt: -1 }).lean();

        const stats = {
            total:     submissions.length,
            submitted: submissions.filter(s => s.status === 'submitted').length,
            late:      submissions.filter(s => s.status === 'late').length,
            pending:   submissions.filter(s => s.status === 'pending').length,
        };

        res.render('teacher/documents/submissions', {
            title: 'Submissions — ' + doc.title,
            layout: 'layouts/main',
            doc,
            submissions,
            stats,
            fmtSize,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load submissions.');
        res.redirect('/teacher/documents');
    }
};

exports.teacherPostReviewSubmission = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const userId   = req.session.userId;
        const { submissionId } = req.params;
        const { marks, feedback } = req.body;

        const sub = await AssignmentSubmission.findById(submissionId).populate('document');
        if (!sub || sub.document.uploadedBy.toString() !== userId.toString()) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        sub.marks      = marks !== undefined && marks !== '' ? Number(marks) : null;
        sub.feedback   = feedback || '';
        sub.reviewedBy = userId;
        sub.reviewedAt = new Date();
        await sub.save();

        if (sub.student) {
            await notifyUsers(
                [sub.student],
                'Assignment Reviewed',
                `Your submission for "${sub.document.title}" has been reviewed.`,
                userId, 'teacher', schoolId
            );
        }

        req.flash('success', 'Submission reviewed.');
        res.redirect(`/teacher/documents/${sub.document._id}/submissions`);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Review failed.');
        res.redirect('/teacher/documents');
    }
};

/* ─────────────────────────────────────────────────────────────
   STUDENT HANDLERS
───────────────────────────────────────────────────────────── */

async function getStudentSection(userId) {
    const profile = await StudentProfile.findOne({ user: userId }).lean();
    return profile ? profile.currentSection : null;
}

// Resolve the active-year Class ID for a given classNumber
async function resolveActiveClassId(schoolId, classNumber) {
    const activeAY = await AcademicYear.findOne({ school: schoolId, status: 'active' }).select('_id').lean();
    if (!activeAY) return null;
    const cls = await Class.findOne({ school: schoolId, academicYear: activeAY._id, classNumber }).lean();
    return cls ? cls._id : null;
}

// Returns { sectionId, classId } — tries multiple sources, normalises classId to the active AY
async function resolveStudentClassInfo(userId, schoolId) {
    const profile = await StudentProfile.findOne({ user: userId }).lean();

    // --- Step 1: resolve section ID ---
    let sectionId = profile ? profile.currentSection : null;

    // Also try ClassSection.enrolledStudents in parallel
    const enrolledSection = await ClassSection.findOne({ enrolledStudents: userId, school: schoolId })
        .select('_id class').lean();

    // Prefer enrolledStudents if currentSection is missing or stale
    if (!sectionId && enrolledSection) {
        sectionId = enrolledSection._id;
    }

    // --- Step 2: resolve raw class ID from section ---
    let rawClassId = null;
    if (sectionId) {
        // Use the section we already fetched if it matches, otherwise fetch
        if (enrolledSection && enrolledSection._id.toString() === sectionId.toString()) {
            rawClassId = enrolledSection.class;
        } else {
            const cs = await ClassSection.findById(sectionId).select('class').lean();
            rawClassId = cs ? cs.class : null;
        }
    }

    // --- Step 3: normalise classId AND sectionId to the ACTIVE academic year ---
    // Documents always store active-year IDs. A student enrolled in a previous year's
    // section would have stale IDs — look up the active-year equivalents by classNumber + sectionName.
    let classId = rawClassId;
    let normalisedSectionId = sectionId;

    if (rawClassId) {
        const rawClass = await Class.findById(rawClassId).select('classNumber').lean();
        if (rawClass) {
            const activeClassId = await resolveActiveClassId(schoolId, rawClass.classNumber);
            if (activeClassId) {
                classId = activeClassId;

                // Also normalise the section: find active-year section with same sectionName in this class
                if (sectionId) {
                    const rawSec = await ClassSection.findById(sectionId).select('sectionName').lean();
                    if (rawSec) {
                        const activeSec = await ClassSection.findOne({
                            school: schoolId,
                            class:  activeClassId,
                            sectionName: rawSec.sectionName,
                        }).select('_id').lean();
                        if (activeSec) normalisedSectionId = activeSec._id;
                    }
                }
            }
        }
    }

    // --- Step 4: legacy plain-text profile.class fallback (e.g. "1", "2") ---
    if (!classId && profile && profile.class) {
        const classNum = parseInt(profile.class, 10);
        if (!isNaN(classNum)) {
            classId = await resolveActiveClassId(schoolId, classNum);
        }
    }

    return { sectionId: normalisedSectionId || sectionId || null, classId: classId || null };
}

exports.studentGetDocuments = async (req, res) => {
    try {
        const schoolId  = req.session.schoolId;
        const userId    = req.session.userId;
        const { category, search, tab } = req.query;
        const activeTab = tab || 'documents';

        const { sectionId, classId: sectionClassId } = await resolveStudentClassInfo(userId, schoolId);

        const baseFilter = {
            school:     schoolId,
            isArchived: false,
            $or: [
                { targetType: 'whole_school' },
                ...(sectionId ? [
                    { targetType: 'class_sections', targetSections: sectionId },
                ] : []),
                ...(sectionClassId ? [
                    { targetType: 'class', targetClasses: sectionClassId },
                ] : []),
            ],
        };

        if (category) baseFilter.category = category;
        if (search)   baseFilter.title = { $regex: search, $options: 'i' };

        const docsFilter = { ...baseFilter, isAssignment: false };
        const assignFilter = { ...baseFilter, isAssignment: true };

        const documents   = await Document.find(docsFilter).populate('uploadedBy', 'name role').sort({ createdAt: -1 }).lean();
        const assignments = await Document.find(assignFilter).populate('uploadedBy', 'name role').sort({ createdAt: -1 }).lean();

        // Student's own submissions
        const mySubMap = {};
        if (assignments.length > 0) {
            const mySubs = await AssignmentSubmission.find({
                document: { $in: assignments.map(a => a._id) },
                student:  userId,
            }).lean();
            for (const sub of mySubs) mySubMap[sub.document.toString()] = sub;
        }

        await logAction(userId, schoolId, 'VIEW_DOCUMENT_LIST', null, null, null);

        res.render('student/documents/index', {
            title: 'Documents',
            layout: 'layouts/main',
            documents,
            assignments,
            mySubMap,
            activeTab,
            filters: { category: category || '', search: search || '' },
            fmtSize,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load documents.');
        res.redirect('/student/dashboard');
    }
};

exports.studentGetDocument = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const userId   = req.session.userId;

        const doc = await Document.findOne({ _id: req.params.id, school: schoolId, isArchived: false })
            .populate('uploadedBy', 'name role').lean();

        if (!doc) {
            req.flash('error', 'Document not found.');
            return res.redirect('/student/documents');
        }

        const accessible = await canAccessDocument(doc, userId, 'student', schoolId);
        if (!accessible) {
            req.flash('error', 'Access denied.');
            return res.redirect('/student/documents');
        }

        let mySubmission = null;
        if (doc.isAssignment) {
            mySubmission = await AssignmentSubmission.findOne({ document: doc._id, student: userId }).lean();
        }

        await logAction(userId, schoolId, 'VIEW_DOCUMENT', doc._id, null, null);

        res.render('student/documents/detail', {
            title: doc.title,
            layout: 'layouts/main',
            doc,
            mySubmission,
            fmtSize,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load document.');
        res.redirect('/student/documents');
    }
};

exports.studentPostSubmitAssignment = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const userId   = req.session.userId;

        const doc = await Document.findOne({ _id: req.params.id, school: schoolId, isAssignment: true, isArchived: false }).lean();
        if (!doc || !doc.allowSubmission) {
            req.flash('error', 'Assignment not found or submissions not allowed.');
            return res.redirect('/student/documents');
        }

        const accessible = await canAccessDocument(doc, userId, 'student', schoolId);
        if (!accessible) {
            req.flash('error', 'Access denied.');
            return res.redirect('/student/documents');
        }

        if (!req.files || req.files.length === 0) {
            req.flash('error', 'Please upload at least one file.');
            return res.redirect(`/student/documents/${doc._id}`);
        }

        const existing = await AssignmentSubmission.findOne({ document: doc._id, student: userId });

        const fileObjects = buildSubmissionFileObjects(req.files);
        const isLate      = doc.dueDate && new Date() > new Date(doc.dueDate);
        const status      = isLate ? 'late' : 'submitted';
        const { sectionId } = await resolveStudentClassInfo(userId, schoolId);

        if (existing) {
            existing.files       = fileObjects;
            existing.status      = status;
            existing.submittedAt = new Date();
            await existing.save();
        } else {
            await AssignmentSubmission.create({
                document:    doc._id,
                school:      schoolId,
                student:     userId,
                section:     sectionId,
                files:       fileObjects,
                status,
                submittedAt: new Date(),
            });
        }

        // Notify teacher/uploader
        await notifyUsers(
            [doc.uploadedBy],
            'New Submission',
            `A student submitted "${doc.title}"${isLate ? ' (late)' : ''}.`,
            userId, 'student', schoolId
        );

        await logAction(userId, schoolId, 'SUBMIT_ASSIGNMENT', doc._id, null, { status });
        req.flash('success', isLate ? 'Submitted (marked as late).' : 'Assignment submitted successfully.');
        res.redirect(`/student/documents/${doc._id}`);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Submission failed: ' + err.message);
        res.redirect(`/student/documents/${req.params.id}`);
    }
};

/* ─────────────────────────────────────────────────────────────
   PARENT HANDLERS
───────────────────────────────────────────────────────────── */

exports.parentGetDocuments = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const userId   = req.session.userId;
        const { category, search } = req.query;

        const parentProfile = await ParentProfile.findOne({ user: userId }).lean();
        if (!parentProfile || !parentProfile.children.length) {
            return res.render('parent/documents/index', {
                title: 'Documents',
                layout: 'layouts/main',
                documents: [],
                assignments: [],
                mySubMap: {},
                filters: { category: '', search: '' },
                fmtSize,
            });
        }

        // Gather all child sections (with fallback to enrolledStudents)
        const sectionIds = [];
        const classIds   = [];
        for (const childId of parentProfile.children) {
            const { sectionId: cSec, classId: cCls } = await resolveStudentClassInfo(childId, schoolId);
            if (cSec) sectionIds.push(cSec);
            if (cCls) classIds.push(cCls);
        }

        const baseFilter = {
            school:     schoolId,
            isArchived: false,
            $or: [
                { targetType: 'whole_school' },
                ...(sectionIds.length ? [
                    { targetType: 'class_sections', targetSections: { $in: sectionIds } },
                ] : []),
                ...(classIds.length ? [
                    { targetType: 'class', targetClasses: { $in: classIds } },
                ] : []),
            ],
        };

        if (category) baseFilter.category = category;
        if (search)   baseFilter.title = { $regex: search, $options: 'i' };

        const documents   = await Document.find({ ...baseFilter, isAssignment: false })
            .populate('uploadedBy', 'name role').sort({ createdAt: -1 }).lean();
        const assignments = await Document.find({ ...baseFilter, isAssignment: true })
            .populate('uploadedBy', 'name role').sort({ createdAt: -1 }).lean();

        // Children's submissions
        const mySubMap = {};
        if (assignments.length > 0) {
            const childUserIds = parentProfile.children;
            const subs = await AssignmentSubmission.find({
                document: { $in: assignments.map(a => a._id) },
                student:  { $in: childUserIds },
            }).populate('student', 'name').lean();
            for (const sub of subs) {
                mySubMap[sub.document.toString()] = sub;
            }
        }

        res.render('parent/documents/index', {
            title: 'Documents',
            layout: 'layouts/main',
            documents,
            assignments,
            mySubMap,
            filters: { category: category || '', search: search || '' },
            fmtSize,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load documents.');
        res.redirect('/parent/dashboard');
    }
};

exports.parentGetDocument = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const userId   = req.session.userId;

        const doc = await Document.findOne({ _id: req.params.id, school: schoolId, isArchived: false })
            .populate('uploadedBy', 'name role').lean();
        if (!doc) {
            req.flash('error', 'Document not found.');
            return res.redirect('/parent/documents');
        }

        const accessible = await canAccessDocument(doc, userId, 'parent', schoolId);
        if (!accessible) {
            req.flash('error', 'Access denied.');
            return res.redirect('/parent/documents');
        }

        // Children's submissions for this assignment
        let childSubmissions = [];
        if (doc.isAssignment) {
            const parentProfile = await ParentProfile.findOne({ user: userId }).lean();
            if (parentProfile) {
                childSubmissions = await AssignmentSubmission.find({
                    document: doc._id,
                    student:  { $in: parentProfile.children },
                }).populate('student', 'name').lean();
            }
        }

        await logAction(userId, schoolId, 'VIEW_DOCUMENT', doc._id, null, null);

        res.render('parent/documents/detail', {
            title: doc.title,
            layout: 'layouts/main',
            doc,
            childSubmissions,
            fmtSize,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load document.');
        res.redirect('/parent/documents');
    }
};

/* ─────────────────────────────────────────────────────────────
   SHARED API (used by upload forms via fetch)
───────────────────────────────────────────────────────────── */

exports.apiGetSections = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const { classId } = req.query;
        const activeAY = await AcademicYear.findOne({ school: schoolId, status: 'active' }).select('_id').lean();
        const filter = { school: schoolId };
        if (activeAY) filter.academicYear = activeAY._id;
        if (classId) filter.class = classId;

        const sections = await ClassSection.find(filter)
            .populate('class', 'className classNumber')
            .sort('sectionName').lean();
        res.json(sections);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
