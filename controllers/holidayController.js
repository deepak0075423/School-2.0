const Holiday             = require('../models/Holiday');
const Class               = require('../models/Class');
const ClassSection        = require('../models/ClassSection');
const StudentProfile      = require('../models/StudentProfile');
const User                = require('../models/User');
const School              = require('../models/School');
const AcademicYear        = require('../models/AcademicYear');
const Notification        = require('../models/Notification');
const NotificationReceipt = require('../models/NotificationReceipt');
const ActivityLog         = require('../models/ActivityLog');
const sseClients          = require('../utils/sseClients');
const xlsx                = require('xlsx');

/* ─────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────── */

const VALID_TYPES = ['public', 'school_specific', 'optional', 'exam_break'];
const VALID_SCOPES = ['all', 'specific_classes', 'specific_departments'];

/* ─────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────── */

function fmtDate(d) {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function parseDateFlexible(raw) {
    if (!raw) return null;
    const s = String(raw).trim();
    // Accept ISO (YYYY-MM-DD), Excel serial, or DD/MM/YYYY or DD-MM-YYYY
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s);
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(s)) {
        const [d, m, y] = s.split(/[\/\-]/);
        return new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);
    }
    // Excel serial number
    if (/^\d+$/.test(s)) {
        const excelEpoch = new Date(1899, 11, 30);
        return new Date(excelEpoch.getTime() + parseInt(s) * 86400000);
    }
    const d = new Date(s);
    return isNaN(d) ? null : d;
}

function holidaySnapshot(h) {
    return {
        name:        h.name,
        type:        h.type,
        startDate:   h.startDate,
        endDate:     h.endDate,
        description: h.description,
        isRecurring: h.isRecurring,
        scope:       h.applicability?.scope,
        classes:     (h.applicability?.classes || []).map(c => c.toString()),
        departments: h.applicability?.departments || [],
    };
}

async function logAction(userId, schoolId, actionType, entityId, oldValue, newValue) {
    try {
        await ActivityLog.create({
            user:       userId,
            school:     schoolId || null,
            actionType,
            entityType: 'Holiday',
            entityId:   entityId || null,
            oldValue:   oldValue || null,
            newValue:   newValue || null,
        });
    } catch (err) {
        console.error('[Holiday] ActivityLog write failed:', err.message);
    }
}

async function resolveHolidayRecipients(applicability, schoolId) {
    const scope = applicability.scope || 'all';
    let ids = [];

    if (scope === 'all') {
        ids = await User.find({
            school: schoolId,
            role: { $in: ['teacher', 'student', 'parent'] },
            isActive: true,
        }).distinct('_id');

    } else if (scope === 'specific_classes') {
        const classIds = (applicability.classes || []).filter(Boolean);
        if (!classIds.length) return [];

        const sections = await ClassSection.find({
            class: { $in: classIds },
            school: schoolId,
        }).select('enrolledStudents classTeacher substituteTeacher');

        const studentUserIds = sections.flatMap(s => s.enrolledStudents.map(id => id.toString()));
        const teacherIds = [
            ...sections.map(s => s.classTeacher?.toString()).filter(Boolean),
            ...sections.map(s => s.substituteTeacher?.toString()).filter(Boolean),
        ];

        const parentProfiles = await StudentProfile.find({
            user: { $in: studentUserIds },
        }).select('parent');
        const parentIds = parentProfiles.map(p => p.parent?.toString()).filter(Boolean);

        ids = [...studentUserIds, ...teacherIds, ...parentIds];

    } else if (scope === 'specific_departments') {
        const depts = applicability.departments || [];
        if (depts.includes('teaching_staff')) {
            const tIds = await User.find({ school: schoolId, role: 'teacher', isActive: true }).distinct('_id');
            ids.push(...tIds.map(id => id.toString()));
        }
        if (depts.includes('admin_staff')) {
            const aIds = await User.find({ school: schoolId, role: 'school_admin', isActive: true }).distinct('_id');
            ids.push(...aIds.map(id => id.toString()));
        }
    }

    return [...new Set(ids.map(id => id.toString()))];
}

async function sendHolidayNotification(holiday, senderId, senderRole, schoolId, isUpdate) {
    try {
        const schoolDoc = await School.findById(schoolId).select('modules');
        if (!schoolDoc?.modules?.notification) return;

        const recipientIds = await resolveHolidayRecipients(holiday.applicability, schoolId);
        if (!recipientIds.length) return;

        const title = isUpdate ? `Holiday Updated: ${holiday.name}` : `New Holiday: ${holiday.name}`;
        const body  = `${holiday.name} has been ${isUpdate ? 'updated' : 'declared'} from ${fmtDate(holiday.startDate)} to ${fmtDate(holiday.endDate)}.`;

        const notification = await Notification.create({
            title,
            body,
            sender:     senderId,
            senderRole,
            school:     schoolId,
            channels:   { inApp: true, email: false },
            target:     { type: 'all', class: null, section: null },
            recipientCount: recipientIds.length,
        });

        const receipts = recipientIds.map(uid => ({
            notification: notification._id,
            recipient:    uid,
            school:       schoolId,
        }));
        await NotificationReceipt.insertMany(receipts, { ordered: false }).catch(() => {});

        sseClients.pushMany(recipientIds, 'notification', {
            title,
            body,
            senderRole,
            createdAt: notification.createdAt,
        });
    } catch (err) {
        console.error('[Holiday] Notification send failed:', err.message);
    }
}

/* ─────────────────────────────────────────────────────────────
   ADMIN — LIST
───────────────────────────────────────────────────────────── */

const adminGetHolidays = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;

        const [holidays, classes, academicYear] = await Promise.all([
            Holiday.find({ school: schoolId })
                .populate('applicability.classes', 'classNumber className')
                .populate('createdBy', 'name')
                .populate('updatedBy', 'name')
                .sort({ startDate: 1 }),
            Class.find({ school: schoolId }).sort({ classNumber: 1 }),
            AcademicYear.findOne({ school: schoolId, status: 'active' }),
        ]);

        const holidaysJson = holidays.map(h => ({
            _id:        h._id,
            name:       h.name,
            startDate:  h.startDate.toISOString().split('T')[0],
            endDate:    h.endDate.toISOString().split('T')[0],
            type:       h.type,
            description: h.description,
            isRecurring: h.isRecurring,
            scope:      h.applicability.scope,
        }));

        res.render('admin/holidays/index', {
            title: 'Holiday Management',
            layout: 'layouts/main',
            holidays,
            holidaysJson: JSON.stringify(holidaysJson),
            classes,
            academicYear,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load holidays.');
        res.redirect('/admin/dashboard');
    }
};

/* ─────────────────────────────────────────────────────────────
   ADMIN — CREATE
───────────────────────────────────────────────────────────── */

const adminGetCreateHoliday = async (req, res) => {
    try {
        const schoolId     = req.session.schoolId;
        const academicYear = await AcademicYear.findOne({ school: schoolId, status: 'active' });
        const classes      = academicYear
            ? await Class.find({ school: schoolId, academicYear: academicYear._id }).sort({ classNumber: 1 })
            : [];
        res.render('admin/holidays/form', {
            title: 'Create Holiday',
            layout: 'layouts/main',
            holiday: null,
            classes,
            academicYear,
            action: '/admin/holidays/create',
        });
    } catch (err) {
        req.flash('error', 'Failed to load form.');
        res.redirect('/admin/holidays');
    }
};

const adminPostCreateHoliday = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const userId   = req.session.userId;
        const { name, startDate, endDate, type, description, isRecurring, scope, classes: rawClasses, departments: rawDepts } = req.body;

        if (!name || !startDate || !endDate || !type) {
            req.flash('error', 'Name, dates and type are required.');
            return res.redirect('/admin/holidays/create');
        }

        const start = new Date(startDate), end = new Date(endDate);
        if (end < start) {
            req.flash('error', 'End date must be on or after start date.');
            return res.redirect('/admin/holidays/create');
        }

        const classIds = rawClasses ? (Array.isArray(rawClasses) ? rawClasses : [rawClasses]) : [];
        const deptList = rawDepts   ? (Array.isArray(rawDepts)   ? rawDepts   : [rawDepts])   : [];
        const academicYear = await AcademicYear.findOne({ school: schoolId, status: 'active' });

        const holiday = await Holiday.create({
            school:      schoolId,
            name:        name.trim(),
            startDate:   start,
            endDate:     end,
            type,
            description: (description || '').trim(),
            isRecurring: isRecurring === 'on',
            applicability: {
                scope:       scope || 'all',
                classes:     scope === 'specific_classes'     ? classIds : [],
                departments: scope === 'specific_departments' ? deptList  : [],
            },
            createdBy:    userId,
            updatedBy:    userId,
            academicYear: academicYear?._id || null,
        });

        await Promise.all([
            sendHolidayNotification(holiday, userId, 'school_admin', schoolId, false),
            logAction(userId, schoolId, 'CREATE_HOLIDAY', holiday._id, null, holidaySnapshot(holiday)),
        ]);

        req.flash('success', `Holiday "${holiday.name}" created successfully.`);
        res.redirect('/admin/holidays');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to create holiday: ' + err.message);
        res.redirect('/admin/holidays/create');
    }
};

/* ─────────────────────────────────────────────────────────────
   ADMIN — EDIT
───────────────────────────────────────────────────────────── */

const adminGetEditHoliday = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const holiday  = await Holiday.findOne({ _id: req.params.id, school: schoolId })
            .populate('applicability.classes', 'classNumber className');

        if (!holiday) {
            req.flash('error', 'Holiday not found.');
            return res.redirect('/admin/holidays');
        }

        const academicYear = await AcademicYear.findOne({ school: schoolId, status: 'active' });
        const classes = academicYear
            ? await Class.find({ school: schoolId, academicYear: academicYear._id }).sort({ classNumber: 1 })
            : [];
        res.render('admin/holidays/form', {
            title:  `Edit: ${holiday.name}`,
            layout: 'layouts/main',
            holiday,
            classes,
            academicYear,
            action: `/admin/holidays/${holiday._id}/edit`,
        });
    } catch (err) {
        req.flash('error', 'Failed to load holiday.');
        res.redirect('/admin/holidays');
    }
};

const adminPostEditHoliday = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const userId   = req.session.userId;
        const { name, startDate, endDate, type, description, isRecurring, scope, classes: rawClasses, departments: rawDepts } = req.body;

        const holiday = await Holiday.findOne({ _id: req.params.id, school: schoolId });
        if (!holiday) {
            req.flash('error', 'Holiday not found.');
            return res.redirect('/admin/holidays');
        }

        const start = new Date(startDate), end = new Date(endDate);
        if (end < start) {
            req.flash('error', 'End date must be on or after start date.');
            return res.redirect(`/admin/holidays/${req.params.id}/edit`);
        }

        const classIds = rawClasses ? (Array.isArray(rawClasses) ? rawClasses : [rawClasses]) : [];
        const deptList = rawDepts   ? (Array.isArray(rawDepts)   ? rawDepts   : [rawDepts])   : [];

        const oldSnap = holidaySnapshot(holiday);

        holiday.name        = name.trim();
        holiday.startDate   = start;
        holiday.endDate     = end;
        holiday.type        = type;
        holiday.description = (description || '').trim();
        holiday.isRecurring = isRecurring === 'on';
        holiday.applicability = {
            scope:       scope || 'all',
            classes:     scope === 'specific_classes'     ? classIds : [],
            departments: scope === 'specific_departments' ? deptList  : [],
        };
        holiday.updatedBy = userId;

        await holiday.save();

        await Promise.all([
            sendHolidayNotification(holiday, userId, 'school_admin', schoolId, true),
            logAction(userId, schoolId, 'UPDATE_HOLIDAY', holiday._id, oldSnap, holidaySnapshot(holiday)),
        ]);

        req.flash('success', `Holiday "${holiday.name}" updated successfully.`);
        res.redirect('/admin/holidays');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to update holiday: ' + err.message);
        res.redirect(`/admin/holidays/${req.params.id}/edit`);
    }
};

/* ─────────────────────────────────────────────────────────────
   ADMIN — DELETE
───────────────────────────────────────────────────────────── */

const adminPostDeleteHoliday = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const userId   = req.session.userId;
        const holiday  = await Holiday.findOneAndDelete({ _id: req.params.id, school: schoolId });

        if (!holiday) {
            req.flash('error', 'Holiday not found.');
            return res.redirect('/admin/holidays');
        }

        await logAction(userId, schoolId, 'DELETE_HOLIDAY', holiday._id, holidaySnapshot(holiday), null);

        req.flash('success', `Holiday "${holiday.name}" deleted.`);
        res.redirect('/admin/holidays');
    } catch (err) {
        req.flash('error', 'Failed to delete holiday.');
        res.redirect('/admin/holidays');
    }
};

/* ─────────────────────────────────────────────────────────────
   ADMIN — IMPORT (CSV / XLSX)
───────────────────────────────────────────────────────────── */

const adminGetImportHolidays = (req, res) => {
    res.render('admin/holidays/import', {
        title:  'Import Holidays',
        layout: 'layouts/main',
    });
};

const adminPostImportHolidays = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const userId   = req.session.userId;

        if (!req.file) {
            req.flash('error', 'Please upload a CSV or Excel file.');
            return res.redirect('/admin/holidays/import');
        }

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

        if (!rows.length) {
            req.flash('error', 'The uploaded file is empty.');
            return res.redirect('/admin/holidays/import');
        }

        const academicYear = await AcademicYear.findOne({ school: schoolId, status: 'active' });

        let created = 0, skipped = 0;
        const errors = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 2; // 1-indexed + header row

            const name = String(row['Name'] || row['name'] || '').trim();
            if (!name) { errors.push(`Row ${rowNum}: Name is required.`); skipped++; continue; }

            const startDate = parseDateFlexible(row['Start Date'] || row['startDate'] || row['start_date']);
            const endDate   = parseDateFlexible(row['End Date']   || row['endDate']   || row['end_date']);

            if (!startDate || isNaN(startDate)) { errors.push(`Row ${rowNum}: Invalid Start Date.`); skipped++; continue; }
            if (!endDate   || isNaN(endDate))   { errors.push(`Row ${rowNum}: Invalid End Date.`);   skipped++; continue; }
            if (endDate < startDate)             { errors.push(`Row ${rowNum}: End Date must be ≥ Start Date.`); skipped++; continue; }

            const rawType = String(row['Type'] || row['type'] || '').trim().toLowerCase().replace(/\s+/g, '_');
            const type    = VALID_TYPES.includes(rawType) ? rawType : 'school_specific';

            const rawScope = String(row['Applicability'] || row['scope'] || 'all').trim().toLowerCase().replace(/\s+/g, '_');
            const scope    = VALID_SCOPES.includes(rawScope) ? rawScope : 'all';

            const description = String(row['Description'] || row['description'] || '').trim();
            const isRecurring = /^(yes|true|1)$/i.test(String(row['Is Recurring'] || row['isRecurring'] || row['recurring'] || ''));

            try {
                const holiday = await Holiday.create({
                    school:      schoolId,
                    name,
                    startDate,
                    endDate,
                    type,
                    description,
                    isRecurring,
                    applicability: { scope, classes: [], departments: [] },
                    createdBy:    userId,
                    updatedBy:    userId,
                    academicYear: academicYear?._id || null,
                });
                await logAction(userId, schoolId, 'CREATE_HOLIDAY', holiday._id, null, holidaySnapshot(holiday));
                created++;
            } catch (e) {
                errors.push(`Row ${rowNum}: ${e.message}`);
                skipped++;
            }
        }

        if (created > 0) {
            await logAction(userId, schoolId, 'IMPORT_HOLIDAYS', null, null, { imported: created, skipped });
        }

        let msg = `Import complete: ${created} holiday${created !== 1 ? 's' : ''} created.`;
        if (skipped > 0) msg += ` ${skipped} row${skipped !== 1 ? 's' : ''} skipped.`;

        if (errors.length > 0) {
            req.flash('error', errors.slice(0, 5).join(' | ') + (errors.length > 5 ? ` …and ${errors.length - 5} more.` : ''));
        }
        req.flash('success', msg);
        res.redirect('/admin/holidays');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Import failed: ' + err.message);
        res.redirect('/admin/holidays/import');
    }
};

/* ─────────────────────────────────────────────────────────────
   ADMIN — EXPORT (XLSX)
───────────────────────────────────────────────────────────── */

const adminGetExportHolidays = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const holidays = await Holiday.find({ school: schoolId })
            .populate('applicability.classes', 'classNumber')
            .populate('createdBy',  'name')
            .populate('updatedBy',  'name')
            .sort({ startDate: 1 });

        const rows = holidays.map(h => ({
            Name:          h.name,
            Type:          h.type,
            'Start Date':  h.startDate.toISOString().split('T')[0],
            'End Date':    h.endDate.toISOString().split('T')[0],
            Duration:      Math.round((h.endDate - h.startDate) / 86400000) + 1,
            Description:   h.description || '',
            'Is Recurring': h.isRecurring ? 'Yes' : 'No',
            Applicability: h.applicability.scope,
            Classes:       (h.applicability.classes || []).map(c => `Class ${c.classNumber}`).join(', '),
            Departments:   (h.applicability.departments || []).join(', '),
            'Created By':  h.createdBy?.name || '—',
            'Updated By':  h.updatedBy?.name || '—',
            'Created At':  h.createdAt?.toLocaleDateString('en-IN') || '',
            'Updated At':  h.updatedAt?.toLocaleDateString('en-IN') || '',
        }));

        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(rows);

        // Column widths
        ws['!cols'] = [
            {wch:28},{wch:16},{wch:12},{wch:12},{wch:10},{wch:36},
            {wch:14},{wch:22},{wch:24},{wch:24},{wch:20},{wch:20},{wch:14},{wch:14},
        ];

        xlsx.utils.book_append_sheet(wb, ws, 'Holidays');
        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', `attachment; filename="holidays-export-${Date.now()}.xlsx"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Export failed.');
        res.redirect('/admin/holidays');
    }
};

/* ─────────────────────────────────────────────────────────────
   ADMIN — DOWNLOAD IMPORT TEMPLATE
───────────────────────────────────────────────────────────── */

const adminGetImportTemplate = (req, res) => {
    const headers = [['Name', 'Start Date', 'End Date', 'Type', 'Description', 'Is Recurring', 'Applicability']];
    const sample  = [['Diwali', '2025-10-20', '2025-10-24', 'public', 'Diwali celebrations', 'Yes', 'all']];
    const note    = [['-- Type values: public | school_specific | optional | exam_break']];
    const note2   = [['-- Applicability values: all | specific_classes | specific_departments']];
    const note3   = [['-- Is Recurring: yes / no']];
    const note4   = [['-- Date format: YYYY-MM-DD (e.g. 2025-10-20)']];

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet([...headers, ...sample, [], ...note, ...note2, ...note3, ...note4]);
    ws['!cols'] = [{wch:28},{wch:14},{wch:14},{wch:18},{wch:36},{wch:14},{wch:26}];
    xlsx.utils.book_append_sheet(wb, ws, 'Template');

    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="holiday-import-template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
};

/* ─────────────────────────────────────────────────────────────
   AUDIT LOG — SCHOOL ADMIN (own school only)
───────────────────────────────────────────────────────────── */

const adminGetAuditLog = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const page     = Math.max(1, parseInt(req.query.page) || 1);
        const limit    = 30;
        const skip     = (page - 1) * limit;

        const filter = {
            school:     schoolId,
            entityType: 'Holiday',
        };
        if (req.query.action) filter.actionType = req.query.action;

        const [logs, total] = await Promise.all([
            ActivityLog.find(filter)
                .populate('user', 'name email role')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            ActivityLog.countDocuments(filter),
        ]);

        res.render('admin/holidays/audit', {
            title:      'Holiday Audit Log',
            layout:     'layouts/main',
            logs,
            page,
            totalPages: Math.ceil(total / limit),
            total,
            actionFilter: req.query.action || '',
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load audit log.');
        res.redirect('/admin/holidays');
    }
};

/* ─────────────────────────────────────────────────────────────
   AUDIT LOG — SUPER ADMIN (all schools)
───────────────────────────────────────────────────────────── */

const superAdminGetAuditLog = async (req, res) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page) || 1);
        const limit = 40;
        const skip  = (page - 1) * limit;

        const filter = { entityType: 'Holiday' };
        if (req.query.school)      filter.school     = req.query.school;
        if (req.query.action)      filter.actionType = req.query.action;
        if (req.query.holidayType) {
            filter.$or = [
                { 'newValue.type': req.query.holidayType },
                { 'oldValue.type': req.query.holidayType },
            ];
        }
        if (req.query.dateFrom || req.query.dateTo) {
            filter.createdAt = {};
            if (req.query.dateFrom) filter.createdAt.$gte = new Date(req.query.dateFrom);
            if (req.query.dateTo) {
                const to = new Date(req.query.dateTo);
                to.setHours(23, 59, 59, 999);
                filter.createdAt.$lte = to;
            }
        }
        if (req.query.userSearch) {
            const matchedUsers = await User.find({
                $or: [
                    { name:  { $regex: req.query.userSearch, $options: 'i' } },
                    { email: { $regex: req.query.userSearch, $options: 'i' } },
                ],
            }).select('_id');
            filter.user = { $in: matchedUsers.map(u => u._id) };
        }

        const [logs, total, schools] = await Promise.all([
            ActivityLog.find(filter)
                .populate('user',   'name email role')
                .populate('school', 'name')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            ActivityLog.countDocuments(filter),
            School.find().select('name').sort({ name: 1 }),
        ]);

        res.render('superAdmin/holidayAudit', {
            title:             'Holiday Audit Log — All Schools',
            layout:            'layouts/main',
            logs,
            page,
            totalPages:        Math.ceil(total / limit),
            total,
            schools,
            schoolFilter:      req.query.school      || '',
            actionFilter:      req.query.action      || '',
            holidayTypeFilter: req.query.holidayType || '',
            dateFromFilter:    req.query.dateFrom    || '',
            dateToFilter:      req.query.dateTo      || '',
            userSearchFilter:  req.query.userSearch  || '',
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load audit log.');
        res.redirect('/super-admin/dashboard');
    }
};

/* ─────────────────────────────────────────────────────────────
   AUDIT LOG EXPORT — SUPER ADMIN (CSV)
───────────────────────────────────────────────────────────── */

const superAdminExportAuditLogCSV = async (req, res) => {
    try {
        const filter = { entityType: 'Holiday' };
        if (req.query.school)      filter.school     = req.query.school;
        if (req.query.action)      filter.actionType = req.query.action;
        if (req.query.holidayType) {
            filter.$or = [
                { 'newValue.type': req.query.holidayType },
                { 'oldValue.type': req.query.holidayType },
            ];
        }
        if (req.query.dateFrom || req.query.dateTo) {
            filter.createdAt = {};
            if (req.query.dateFrom) filter.createdAt.$gte = new Date(req.query.dateFrom);
            if (req.query.dateTo) {
                const to = new Date(req.query.dateTo);
                to.setHours(23, 59, 59, 999);
                filter.createdAt.$lte = to;
            }
        }
        if (req.query.userSearch) {
            const matchedUsers = await User.find({
                $or: [
                    { name:  { $regex: req.query.userSearch, $options: 'i' } },
                    { email: { $regex: req.query.userSearch, $options: 'i' } },
                ],
            }).select('_id');
            filter.user = { $in: matchedUsers.map(u => u._id) };
        }

        const logs = await ActivityLog.find(filter)
            .populate('user',   'name email role')
            .populate('school', 'name')
            .sort({ createdAt: -1 })
            .limit(5000);

        const actionLabels = {
            CREATE_HOLIDAY:  'Created',
            UPDATE_HOLIDAY:  'Updated',
            DELETE_HOLIDAY:  'Deleted',
            IMPORT_HOLIDAYS: 'Imported',
        };

        const rows = logs.map(log => {
            const snapshot = log.newValue || log.oldValue || {};
            const dt = new Date(log.createdAt);
            const holidayName = log.actionType === 'IMPORT_HOLIDAYS'
                ? `Bulk Import (${log.newValue?.imported || 0} created, ${log.newValue?.skipped || 0} skipped)`
                : (snapshot.name || '—');
            const changes = log.actionType === 'UPDATE_HOLIDAY' && log.oldValue && log.newValue
                ? ['name','type','startDate','endDate','scope']
                    .filter(k => String(log.oldValue[k]||'') !== String(log.newValue[k]||''))
                    .map(k => `${k}: ${log.oldValue[k]} → ${log.newValue[k]}`)
                    .join('; ') || 'Minor update'
                : '';
            return {
                'Action':        actionLabels[log.actionType] || log.actionType,
                'School':        log.school?.name || '—',
                'Holiday Name':  holidayName,
                'Holiday Type':  snapshot.type ? snapshot.type.replace(/_/g, ' ') : '—',
                'Start Date':    snapshot.startDate ? fmtDate(snapshot.startDate) : '—',
                'End Date':      snapshot.endDate   ? fmtDate(snapshot.endDate)   : '—',
                'Performed By':  log.user?.name  || '—',
                'User Email':    log.user?.email || '—',
                'Role':          log.user?.role?.replace(/_/g, ' ') || '—',
                'Date':          dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
                'Time':          dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
                'Changes':       changes,
            };
        });

        const ws = xlsx.utils.json_to_sheet(rows);
        ws['!cols'] = [
            {wch:12},{wch:28},{wch:36},{wch:18},{wch:14},{wch:14},
            {wch:22},{wch:28},{wch:16},{wch:16},{wch:10},{wch:40},
        ];
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, 'Holiday Audit Log');
        const buf = xlsx.write(wb, { type: 'buffer', bookType: 'csv' });

        res.setHeader('Content-Disposition', 'attachment; filename="holiday-audit-log.csv"');
        res.setHeader('Content-Type', 'text/csv');
        res.send(buf);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to export audit log.');
        res.redirect('/super-admin/holidays/audit');
    }
};

/* ─────────────────────────────────────────────────────────────
   TEACHER VIEW
───────────────────────────────────────────────────────────── */

const teacherGetHolidays = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const userId   = req.session.userId;

        const teacherSections = await ClassSection.find({
            school: schoolId,
            $or: [{ classTeacher: userId }, { substituteTeacher: userId }],
        }).select('class');
        const myClassIds = [...new Set(teacherSections.map(s => s.class.toString()))];

        const holidays = await Holiday.find({
            school: schoolId,
            $or: [
                { 'applicability.scope': 'all' },
                { 'applicability.scope': 'specific_departments', 'applicability.departments': 'teaching_staff' },
                { 'applicability.scope': 'specific_classes', 'applicability.classes': { $in: myClassIds } },
            ],
        })
        .populate('applicability.classes', 'classNumber className')
        .sort({ startDate: 1 });

        const holidaysJson = holidays.map(h => ({
            _id:        h._id,
            name:       h.name,
            startDate:  h.startDate.toISOString().split('T')[0],
            endDate:    h.endDate.toISOString().split('T')[0],
            type:       h.type,
            description: h.description,
            isRecurring: h.isRecurring,
            scope:      h.applicability.scope,
        }));

        res.render('teacher/holidays', {
            title:        'School Holidays',
            layout:       'layouts/main',
            holidays,
            holidaysJson: JSON.stringify(holidaysJson),
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load holidays.');
        res.redirect('/teacher/dashboard');
    }
};

/* ─────────────────────────────────────────────────────────────
   STUDENT VIEW
───────────────────────────────────────────────────────────── */

const studentGetHolidays = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const userId   = req.session.userId;

        const profile = await StudentProfile.findOne({ user: userId }).select('currentSection');
        let myClassId = null;

        if (profile?.currentSection) {
            const section = await ClassSection.findById(profile.currentSection).select('class');
            if (section) myClassId = section.class.toString();
        }

        const orConditions = [{ 'applicability.scope': 'all' }];
        if (myClassId) {
            orConditions.push({ 'applicability.scope': 'specific_classes', 'applicability.classes': myClassId });
        }

        const holidays = await Holiday.find({ school: schoolId, $or: orConditions })
            .populate('applicability.classes', 'classNumber className')
            .sort({ startDate: 1 });

        const holidaysJson = holidays.map(h => ({
            _id:        h._id,
            name:       h.name,
            startDate:  h.startDate.toISOString().split('T')[0],
            endDate:    h.endDate.toISOString().split('T')[0],
            type:       h.type,
            description: h.description,
            isRecurring: h.isRecurring,
            scope:      h.applicability.scope,
        }));

        res.render('student/holidays', {
            title:        'School Holidays',
            layout:       'layouts/main',
            holidays,
            holidaysJson: JSON.stringify(holidaysJson),
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load holidays.');
        res.redirect('/student/dashboard');
    }
};

/* ─────────────────────────────────────────────────────────────
   PARENT VIEW
───────────────────────────────────────────────────────────── */

const parentGetHolidays = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const userId   = req.session.userId;

        const childProfiles = await StudentProfile.find({ parent: userId }).select('currentSection');
        const classIds = [];
        for (const cp of childProfiles) {
            if (cp.currentSection) {
                const section = await ClassSection.findById(cp.currentSection).select('class');
                if (section) classIds.push(section.class.toString());
            }
        }

        const orConditions = [{ 'applicability.scope': 'all' }];
        if (classIds.length > 0) {
            orConditions.push({ 'applicability.scope': 'specific_classes', 'applicability.classes': { $in: classIds } });
        }

        const holidays = await Holiday.find({ school: schoolId, $or: orConditions })
            .populate('applicability.classes', 'classNumber className')
            .sort({ startDate: 1 });

        const holidaysJson = holidays.map(h => ({
            _id:        h._id,
            name:       h.name,
            startDate:  h.startDate.toISOString().split('T')[0],
            endDate:    h.endDate.toISOString().split('T')[0],
            type:       h.type,
            description: h.description,
            isRecurring: h.isRecurring,
            scope:      h.applicability.scope,
        }));

        res.render('parent/holidays', {
            title:        'School Holidays',
            layout:       'layouts/main',
            holidays,
            holidaysJson: JSON.stringify(holidaysJson),
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load holidays.');
        res.redirect('/parent/dashboard');
    }
};

module.exports = {
    adminGetHolidays,
    adminGetCreateHoliday,
    adminPostCreateHoliday,
    adminGetEditHoliday,
    adminPostEditHoliday,
    adminPostDeleteHoliday,
    adminGetImportHolidays,
    adminPostImportHolidays,
    adminGetExportHolidays,
    adminGetImportTemplate,
    adminGetAuditLog,
    superAdminGetAuditLog,
    superAdminExportAuditLogCSV,
    teacherGetHolidays,
    studentGetHolidays,
    parentGetHolidays,
};
