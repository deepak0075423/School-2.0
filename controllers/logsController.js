const ActivityLog                    = require('../models/ActivityLog');
const LibraryAuditLog                = require('../models/LibraryAuditLog');
const PayrollAuditLog                = require('../models/PayrollAuditLog');
const ExamViolation                  = require('../models/ExamViolation');
const AttendanceCorrection           = require('../models/AttendanceCorrection');
const TeacherAttendanceRegularization = require('../models/TeacherAttendanceRegularization');
const StudentSectionHistory          = require('../models/StudentSectionHistory');
const ClassSection                   = require('../models/ClassSection');
const User                           = require('../models/User');
const School                         = require('../models/School');
const xlsx                           = require('xlsx');

/* ────────────────────────────────────────────────────────────
   MODULE DEFINITIONS
──────────────────────────────────────────────────────────── */

const ACTIVITY_MODULE_TYPES = {
    Holiday:  ['Holiday'],
    Document: ['Document'],
    Leave:    ['LeaveApplication'],
    Class:    ['Class', 'ClassSection', 'AcademicYear'],
};
const ALL_ACTIVITY_TYPES = Object.values(ACTIVITY_MODULE_TYPES).flat();

const MODULE_ICONS = {
    Holiday: '🏖', Document: '📄', Leave: '🏃', Class: '🏫',
    Library: '📚', Payroll: '💰', Attendance: '📅', Exam: '📝',
};

const ALL_MODULES = ['Holiday', 'Document', 'Leave', 'Class', 'Library', 'Payroll', 'Attendance', 'Exam'];

/* ────────────────────────────────────────────────────────────
   NORMALIZERS  — every source → common shape
──────────────────────────────────────────────────────────── */

function moduleFromEntityType(et) {
    for (const [mod, types] of Object.entries(ACTIVITY_MODULE_TYPES)) {
        if (types.includes(et)) return mod;
    }
    return 'Other';
}

function normalizeActivity(log) {
    return {
        module:     moduleFromEntityType(log.entityType),
        school:     log.school,
        user:       log.user,
        actionType: log.actionType,
        entityType: log.entityType,
        timestamp:  log.createdAt,
        details:    _detailsFromSnap(log.newValue || log.oldValue),
    };
}

function normalizeLibrary(log) {
    const snap = log.newValue || log.oldValue || {};
    return {
        module:     'Library',
        school:     log.school,
        user:       log.user,
        actionType: log.actionType,
        entityType: log.entityType,
        timestamp:  log.timestamp,
        details:    snap.title || snap.bookTitle || snap.isbn || '',
    };
}

function normalizePayroll(log) {
    const snap = log.newValue || log.oldValue || {};
    return {
        module:     'Payroll',
        school:     log.school,
        user:       log.user,
        actionType: log.actionType,
        entityType: log.entityType,
        timestamp:  log.timestamp,
        details:    snap.name || snap.employeeName || snap.month || '',
    };
}

function normalizeExamViolation(log) {
    return {
        module:     'Exam',
        school:     log.school,
        user:       log.student,
        actionType: log.violationType.toUpperCase(),
        entityType: 'ExamViolation',
        timestamp:  log.occurredAt,
        details:    `Violation during exam`,
    };
}

function normalizeAttendanceCorrection(log) {
    return {
        module:     'Attendance',
        school:     log.school,
        user:       log.student,
        actionType: 'CORRECTION_REQUEST',
        entityType: 'AttendanceCorrection',
        timestamp:  log.createdAt,
        details:    `${log.currentStatus} → ${log.requestedStatus} (${log.status})`,
    };
}

function normalizeTeacherRegularization(log) {
    return {
        module:     'Attendance',
        school:     log.school,
        user:       log.teacher,
        actionType: 'REGULARIZATION_REQUEST',
        entityType: 'TeacherAttendanceRegularization',
        timestamp:  log.createdAt,
        details:    `${log.requestType} — ${log.requestedStatus} (${log.status})`,
    };
}

function normalizeSectionTransfer(log) {
    return {
        module:     'Class',
        school:     log._school || null,
        user:       log.transferredBy,
        actionType: 'SECTION_TRANSFER',
        entityType: 'StudentSectionHistory',
        timestamp:  log.transferDate,
        details:    log.transferReason || 'Section transfer',
    };
}

function _detailsFromSnap(snap) {
    if (!snap || typeof snap !== 'object') return '';
    return snap.name || snap.title || snap.leaveType || snap.className ||
           snap.yearName || snap.sectionName || '';
}

/* ────────────────────────────────────────────────────────────
   FILTER BUILDER — shared across all endpoints
──────────────────────────────────────────────────────────── */

async function buildFilters(query, beforeCursor) {
    const { school, module, dateFrom, dateTo, userSearch } = query;

    const activityFilter   = { entityType: { $in: ALL_ACTIVITY_TYPES } };
    const libraryFilter    = {};
    const payrollFilter    = {};
    const examFilter       = {};
    const correctionFilter = {};
    const regularizeFilter = {};

    // School
    if (school) {
        activityFilter.school   = school;
        libraryFilter.school    = school;
        payrollFilter.school    = school;
        examFilter.school       = school;
        correctionFilter.school = school;
        regularizeFilter.school = school;
    }

    // Date range (from query params)
    const buildRange = () => {
        const range = {};
        if (dateFrom) range.$gte = new Date(dateFrom);
        if (dateTo) {
            const to = new Date(dateTo);
            to.setHours(23, 59, 59, 999);
            range.$lte = to;
        }
        return Object.keys(range).length ? range : null;
    };

    const dateRange = buildRange();
    if (dateRange) {
        activityFilter.createdAt   = { ...dateRange };
        libraryFilter.timestamp    = { ...dateRange };
        payrollFilter.timestamp    = { ...dateRange };
        examFilter.occurredAt      = { ...dateRange };
        correctionFilter.createdAt = { ...dateRange };
        regularizeFilter.createdAt = { ...dateRange };
    }

    // Cursor (lazy load — records older than this timestamp)
    if (beforeCursor) {
        const lt = { $lt: beforeCursor };
        activityFilter.createdAt   = { ...(activityFilter.createdAt   || {}), ...lt };
        libraryFilter.timestamp    = { ...(libraryFilter.timestamp    || {}), ...lt };
        payrollFilter.timestamp    = { ...(payrollFilter.timestamp    || {}), ...lt };
        examFilter.occurredAt      = { ...(examFilter.occurredAt      || {}), ...lt };
        correctionFilter.createdAt = { ...(correctionFilter.createdAt || {}), ...lt };
        regularizeFilter.createdAt = { ...(regularizeFilter.createdAt || {}), ...lt };
    }

    // User search
    if (userSearch) {
        const matched = await User.find({
            $or: [
                { name:  { $regex: userSearch, $options: 'i' } },
                { email: { $regex: userSearch, $options: 'i' } },
            ],
        }).select('_id');
        const ids = matched.map(u => u._id);
        activityFilter.user    = { $in: ids };
        libraryFilter.user     = { $in: ids };
        payrollFilter.user     = { $in: ids };
        examFilter.student     = { $in: ids };
        correctionFilter.student  = { $in: ids };
        regularizeFilter.teacher  = { $in: ids };
    }

    // Module filter — which sources to query
    let fetch = {
        activity: true, library: true, payroll: true,
        exam: true, correction: true, regularize: true, section: true,
    };

    if (module) {
        fetch = { activity: false, library: false, payroll: false, exam: false, correction: false, regularize: false, section: false };
        if (ACTIVITY_MODULE_TYPES[module]) {
            fetch.activity = true;
            activityFilter.entityType = { $in: ACTIVITY_MODULE_TYPES[module] };
            if (module === 'Class') fetch.section = true;
        } else if (module === 'Library')    { fetch.library    = true; }
        else if (module === 'Payroll')      { fetch.payroll    = true; }
        else if (module === 'Attendance')   { fetch.correction = true; fetch.regularize = true; }
        else if (module === 'Exam')         { fetch.exam       = true; }
    }

    return { activityFilter, libraryFilter, payrollFilter, examFilter, correctionFilter, regularizeFilter, fetch };
}

/* ────────────────────────────────────────────────────────────
   QUERY HELPER — fetch all sources in parallel
──────────────────────────────────────────────────────────── */

const USER_POP   = { path: 'user',    select: 'name email role' };
const SCHOOL_POP = { path: 'school',  select: 'name' };
const STUDENT_POP = { path: 'student', select: 'name email role' };
const TEACHER_POP = { path: 'teacher', select: 'name email role' };
const BY_POP     = { path: 'transferredBy', select: 'name email role' };

async function fetchAllSources(filters, limit, schoolId) {
    const { activityFilter, libraryFilter, payrollFilter, examFilter, correctionFilter, regularizeFilter, fetch } = filters;

    // For StudentSectionHistory: need section IDs when school filter is set
    let sectionIds = null;
    if (schoolId && fetch.section) {
        const sections = await ClassSection.find({ school: schoolId }).select('_id');
        sectionIds = sections.map(s => s._id);
    }

    const sectionFilter = sectionIds ? { newSection: { $in: sectionIds } } : {};

    const [actLogs, libLogs, payLogs, examLogs, corrLogs, regLogs, secLogs] = await Promise.all([
        fetch.activity
            ? ActivityLog.find(activityFilter)
                .populate([USER_POP, SCHOOL_POP])
                .sort({ createdAt: -1 }).limit(limit)
            : [],
        fetch.library
            ? LibraryAuditLog.find(libraryFilter)
                .populate([USER_POP, SCHOOL_POP])
                .sort({ timestamp: -1 }).limit(limit)
            : [],
        fetch.payroll
            ? PayrollAuditLog.find(payrollFilter)
                .populate([USER_POP, SCHOOL_POP])
                .sort({ timestamp: -1 }).limit(limit)
            : [],
        fetch.exam
            ? ExamViolation.find(examFilter)
                .populate([STUDENT_POP, SCHOOL_POP])
                .sort({ occurredAt: -1 }).limit(limit)
            : [],
        fetch.correction
            ? AttendanceCorrection.find(correctionFilter)
                .populate([STUDENT_POP, SCHOOL_POP])
                .sort({ createdAt: -1 }).limit(limit)
            : [],
        fetch.regularize
            ? TeacherAttendanceRegularization.find(regularizeFilter)
                .populate([TEACHER_POP, SCHOOL_POP])
                .sort({ createdAt: -1 }).limit(limit)
            : [],
        fetch.section
            ? StudentSectionHistory.find(sectionFilter)
                .populate([BY_POP, { path: 'student', select: 'name' }, { path: 'newSection', select: 'name school', populate: { path: 'school', select: 'name' } }])
                .sort({ transferDate: -1 }).limit(limit)
            : [],
    ]);

    // Attach school to section history entries
    const secNormalized = secLogs.map(log => {
        const entry = normalizeSectionTransfer(log);
        entry._school = log.newSection?.school || null;
        return entry;
    });

    return [
        ...actLogs.map(normalizeActivity),
        ...libLogs.map(normalizeLibrary),
        ...payLogs.map(normalizePayroll),
        ...examLogs.map(normalizeExamViolation),
        ...corrLogs.map(normalizeAttendanceCorrection),
        ...regLogs.map(normalizeTeacherRegularization),
        ...secNormalized,
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

/* ────────────────────────────────────────────────────────────
   SERIALIZE — plain object safe for JSON / EJS rendering
──────────────────────────────────────────────────────────── */

function serializeLog(log) {
    const user = log.user;
    const school = log.school;
    return {
        module:     log.module,
        actionType: log.actionType,
        entityType: log.entityType,
        details:    log.details || '',
        timestamp:  log.timestamp ? new Date(log.timestamp).toISOString() : null,
        userName:   user?.name   || '—',
        userRole:   (user?.role  || '').replace(/_/g, ' '),
        schoolName: school?.name || log._school?.name || '—',
    };
}

/* ────────────────────────────────────────────────────────────
   ROUTE HANDLERS
──────────────────────────────────────────────────────────── */

const BATCH = 50;

/* GET /super-admin/logs  — initial page render */
const getLogs = async (req, res) => {
    try {
        const filters = await buildFilters(req.query, null);
        const schools = await School.find().select('name').sort({ name: 1 });

        const all   = await fetchAllSources(filters, BATCH + 1, req.query.school || null);
        const hasMore = all.length > BATCH;
        const logs  = all.slice(0, BATCH).map(serializeLog);
        const nextCursor = logs.length > 0 ? logs[logs.length - 1].timestamp : null;

        res.render('superAdmin/logs', {
            title:            'Logs',
            layout:           'layouts/main',
            logs,
            hasMore,
            nextCursor:       nextCursor || '',
            schools,
            moduleIcons:      MODULE_ICONS,
            allModules:       ALL_MODULES,
            schoolFilter:     req.query.school     || '',
            moduleFilter:     req.query.module     || '',
            dateFromFilter:   req.query.dateFrom   || '',
            dateToFilter:     req.query.dateTo     || '',
            userSearchFilter: req.query.userSearch || '',
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load logs.');
        res.redirect('/super-admin/dashboard');
    }
};

/* GET /super-admin/logs/more  — JSON endpoint for infinite scroll */
const getLogsMore = async (req, res) => {
    try {
        const before = req.query.before ? new Date(req.query.before) : null;
        if (!before || isNaN(before)) return res.json({ logs: [], hasMore: false });

        const filters = await buildFilters(req.query, before);
        const all     = await fetchAllSources(filters, BATCH + 1, req.query.school || null);
        const hasMore = all.length > BATCH;
        const logs    = all.slice(0, BATCH).map(serializeLog);

        res.json({ logs, hasMore });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load more logs.' });
    }
};

/* GET /super-admin/logs/export  — CSV download */
const exportLogsCSV = async (req, res) => {
    try {
        const CAP = 5000;
        const filters = await buildFilters(req.query, null);
        const all = await fetchAllSources(filters, CAP, req.query.school || null);

        const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
        const fmtTime = d => d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';

        const rows = all.map(log => {
            const s = serializeLog(log);
            return {
                'Module':       s.module,
                'Action':       s.actionType,
                'Entity Type':  s.entityType || '—',
                'School':       s.schoolName,
                'Performed By': s.userName,
                'Role':         s.userRole,
                'Date':         fmtDate(s.timestamp),
                'Time':         fmtTime(s.timestamp),
                'Details':      s.details,
            };
        });

        const ws = xlsx.utils.json_to_sheet(rows);
        ws['!cols'] = [{wch:14},{wch:30},{wch:28},{wch:28},{wch:22},{wch:16},{wch:14},{wch:10},{wch:40}];
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, 'Logs');
        const buf = xlsx.write(wb, { type: 'buffer', bookType: 'csv' });

        res.setHeader('Content-Disposition', 'attachment; filename="school-logs.csv"');
        res.setHeader('Content-Type', 'text/csv');
        res.send(buf);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to export logs.');
        res.redirect('/super-admin/logs');
    }
};

module.exports = { getLogs, getLogsMore, exportLogsCSV };
