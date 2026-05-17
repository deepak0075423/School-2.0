'use strict';
const LeaveType        = require('../models/LeaveType');
const LeaveApplication = require('../models/LeaveApplication');
const LeaveBalance     = require('../models/LeaveBalance');
const School           = require('../models/School');
const User             = require('../models/User');
const AcademicYear     = require('../models/AcademicYear');
const XLSX             = require('xlsx');
const path             = require('path');

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getActiveAcademicYearLabel(schoolId) {
    const ay = await AcademicYear.findOne({ school: schoolId, status: 'active' }).lean();
    if (!ay) return null;
    // label like "2025-26"
    if (ay.label) return ay.label;
    const y = new Date(ay.startDate || ay.createdAt).getFullYear();
    return `${y}-${String(y + 1).slice(-2)}`;
}

function countWorkingDays(from, to, saturdayWorking = true) {
    let days = 0;
    const cur = new Date(from);
    cur.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(0, 0, 0, 0);
    while (cur <= end) {
        const dow = cur.getDay();
        if (dow !== 0 && (saturdayWorking || dow !== 6)) days++;
        cur.setDate(cur.getDate() + 1);
    }
    return days;
}

async function ensureBalance(teacherId, schoolId, leaveTypeId, academicYear) {
    let bal = await LeaveBalance.findOne({ teacher: teacherId, school: schoolId, leaveType: leaveTypeId, academicYear });
    if (!bal) {
        const lt = await LeaveType.findById(leaveTypeId).lean();
        bal = await LeaveBalance.create({
            teacher:        teacherId,
            school:         schoolId,
            leaveType:      leaveTypeId,
            academicYear,
            totalAllocated: lt?.annualAllocation || 0,
            carriedForward: 0,
            used:           0,
            pending:        0,
        });
    }
    return bal;
}

// ── Admin: Leave Types ────────────────────────────────────────────────────────

exports.adminGetLeaveTypes = async (req, res) => {
    try {
        const types = await LeaveType.find({ school: req.schoolId }).sort({ name: 1 }).lean();
        res.json({ success: true, data: types });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.adminCreateLeaveType = async (req, res) => {
    try {
        const { name, code, annualAllocation, monthlyAccrual, carryForward, encashable,
                maxConsecutiveDays, requiresDocument, documentRequiredAfterDays, isActive } = req.body;
        if (!name?.trim()) return res.status(400).json({ success: false, message: 'Name is required' });
        if (!code?.trim()) return res.status(400).json({ success: false, message: 'Code is required' });

        const lt = await LeaveType.create({
            school: req.schoolId,
            name:   name.trim(),
            code:   code.trim().toUpperCase(),
            annualAllocation:           Number(annualAllocation) || 0,
            monthlyAccrual:             monthlyAccrual  || { enabled: false, daysPerMonth: 0 },
            carryForward:               carryForward    || { enabled: false, maxDays: 0 },
            encashable:                 !!encashable,
            maxConsecutiveDays:         Number(maxConsecutiveDays) || 0,
            requiresDocument:           !!requiresDocument,
            documentRequiredAfterDays:  Number(documentRequiredAfterDays) || 0,
            isActive:                   isActive !== false,
            createdBy:                  req.userId,
        });
        res.status(201).json({ success: true, data: lt });
    } catch (e) {
        if (e.code === 11000) return res.status(400).json({ success: false, message: 'Leave type code already exists' });
        res.status(500).json({ success: false, message: e.message });
    }
};

exports.adminUpdateLeaveType = async (req, res) => {
    try {
        const { name, code, annualAllocation, monthlyAccrual, carryForward, encashable,
                maxConsecutiveDays, requiresDocument, documentRequiredAfterDays, isActive } = req.body;
        const update = {};
        if (name                     !== undefined) update.name                     = name.trim();
        if (code                     !== undefined) update.code                     = code.trim().toUpperCase();
        if (annualAllocation         !== undefined) update.annualAllocation         = Number(annualAllocation);
        if (monthlyAccrual           !== undefined) update.monthlyAccrual           = monthlyAccrual;
        if (carryForward             !== undefined) update.carryForward             = carryForward;
        if (encashable               !== undefined) update.encashable               = !!encashable;
        if (maxConsecutiveDays       !== undefined) update.maxConsecutiveDays       = Number(maxConsecutiveDays);
        if (requiresDocument         !== undefined) update.requiresDocument         = !!requiresDocument;
        if (documentRequiredAfterDays!== undefined) update.documentRequiredAfterDays= Number(documentRequiredAfterDays);
        if (isActive                 !== undefined) update.isActive                 = !!isActive;

        const lt = await LeaveType.findOneAndUpdate(
            { _id: req.params.id, school: req.schoolId },
            update,
            { new: true, runValidators: true }
        ).lean();
        if (!lt) return res.status(404).json({ success: false, message: 'Leave type not found' });
        res.json({ success: true, data: lt });
    } catch (e) {
        if (e.code === 11000) return res.status(400).json({ success: false, message: 'Leave type code already exists' });
        res.status(500).json({ success: false, message: e.message });
    }
};

exports.adminDeleteLeaveType = async (req, res) => {
    try {
        const inUse = await LeaveApplication.exists({ leaveType: req.params.id, school: req.schoolId });
        if (inUse) return res.status(400).json({ success: false, message: 'Cannot delete — leave type is in use' });
        const lt = await LeaveType.findOneAndDelete({ _id: req.params.id, school: req.schoolId });
        if (!lt) return res.status(404).json({ success: false, message: 'Leave type not found' });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// ── Admin: Leave Settings ─────────────────────────────────────────────────────

exports.adminUpdateLeaveSettings = async (req, res) => {
    try {
        const { saturdayWorking } = req.body;
        const school = await School.findByIdAndUpdate(
            req.schoolId,
            { 'leaveSettings.saturdayWorking': !!saturdayWorking },
            { new: true, select: 'leaveSettings' }
        ).lean();
        res.json({ success: true, data: school.leaveSettings });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// ── Admin: Leave Requests ─────────────────────────────────────────────────────

exports.adminGetRequests = async (req, res) => {
    try {
        const { status, teacherId, leaveType, fromDate, toDate, page = 1, limit = 20 } = req.query;
        const filter = { school: req.schoolId };
        if (status)    filter.status    = status;
        if (teacherId) filter.teacher   = teacherId;
        if (leaveType) filter.leaveType = leaveType;
        if (fromDate || toDate) {
            filter.fromDate = {};
            if (fromDate) filter.fromDate.$gte = new Date(fromDate);
            if (toDate)   filter.fromDate.$lte = new Date(toDate);
        }
        const [apps, total] = await Promise.all([
            LeaveApplication.find(filter)
                .populate('teacher',  'name email employeeId')
                .populate('leaveType','name code')
                .populate('approvedBy','name')
                .sort({ appliedAt: -1 })
                .skip((+page - 1) * +limit)
                .limit(+limit)
                .lean(),
            LeaveApplication.countDocuments(filter),
        ]);
        res.json({ success: true, data: apps, total, page: +page, pages: Math.ceil(total / +limit) });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.adminApplyLeave = async (req, res) => {
    try {
        const { teacherId, leaveTypeId, fromDate, toDate, leaveMode, reason } = req.body;
        if (!teacherId || !leaveTypeId || !fromDate || !toDate || !reason)
            return res.status(400).json({ success: false, message: 'teacherId, leaveTypeId, fromDate, toDate and reason are required' });

        const school = await School.findById(req.schoolId).select('leaveSettings').lean();
        const satWorking = school?.leaveSettings?.saturdayWorking !== false;
        const from = new Date(fromDate);
        const to   = new Date(toDate);
        if (to < from) return res.status(400).json({ success: false, message: 'toDate must be on or after fromDate' });

        let totalDays = countWorkingDays(from, to, satWorking);
        if (leaveMode === 'half_day') totalDays = 0.5;

        const ay = await getActiveAcademicYearLabel(req.schoolId);
        if (!ay) return res.status(400).json({ success: false, message: 'No active academic year' });

        const bal = await ensureBalance(teacherId, req.schoolId, leaveTypeId, ay);
        const remaining = Math.max(0, bal.totalAllocated + bal.carriedForward - bal.used - bal.pending);
        if (totalDays > remaining)
            return res.status(400).json({ success: false, message: `Insufficient balance. Available: ${remaining}` });

        const app = await LeaveApplication.create({
            teacher: teacherId, school: req.schoolId, leaveType: leaveTypeId,
            fromDate: from, toDate: to, totalDays,
            leaveMode: leaveMode || 'full_day', reason, appliedAt: new Date(),
        });
        await LeaveBalance.updateOne(
            { teacher: teacherId, school: req.schoolId, leaveType: leaveTypeId, academicYear: ay },
            { $inc: { pending: totalDays } }
        );
        res.status(201).json({ success: true, data: app });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.adminGetTeacherBalance = async (req, res) => {
    try {
        const { teacherId } = req.query;
        if (!teacherId) return res.status(400).json({ success: false, message: 'teacherId is required' });
        const ay = await getActiveAcademicYearLabel(req.schoolId);
        const balances = await LeaveBalance.find({ teacher: teacherId, school: req.schoolId, academicYear: ay })
            .populate('leaveType', 'name code')
            .lean();
        const data = balances.map(b => ({
            ...b,
            remaining: Math.max(0, b.totalAllocated + b.carriedForward - b.used - b.pending),
        }));
        res.json({ success: true, data, academicYear: ay });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.adminApproveRequest = async (req, res) => {
    try {
        const app = await LeaveApplication.findOne({ _id: req.params.id, school: req.schoolId });
        if (!app) return res.status(404).json({ success: false, message: 'Leave request not found' });
        if (app.status !== 'pending')
            return res.status(400).json({ success: false, message: 'Only pending requests can be approved' });

        app.status     = 'approved';
        app.approvedBy = req.userId;
        app.approvedAt = new Date();
        app.adminComment = req.body.adminComment || '';
        await app.save();

        const ay = await getActiveAcademicYearLabel(req.schoolId);
        await LeaveBalance.updateOne(
            { teacher: app.teacher, school: req.schoolId, leaveType: app.leaveType, academicYear: ay },
            { $inc: { used: app.totalDays, pending: -app.totalDays } }
        );
        res.json({ success: true, data: app });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.adminRejectRequest = async (req, res) => {
    try {
        const { adminComment } = req.body;
        const app = await LeaveApplication.findOne({ _id: req.params.id, school: req.schoolId });
        if (!app) return res.status(404).json({ success: false, message: 'Leave request not found' });
        if (!['pending', 'modification_requested'].includes(app.status))
            return res.status(400).json({ success: false, message: 'Cannot reject in current status' });

        const oldStatus = app.status;
        app.status      = 'rejected';
        app.rejectedAt  = new Date();
        app.adminComment = adminComment || '';
        await app.save();

        // If it was pending, remove from pending count
        if (oldStatus === 'pending') {
            const ay = await getActiveAcademicYearLabel(req.schoolId);
            await LeaveBalance.updateOne(
                { teacher: app.teacher, school: req.schoolId, leaveType: app.leaveType, academicYear: ay },
                { $inc: { pending: -app.totalDays } }
            );
        }
        res.json({ success: true, data: app });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.adminRequestModification = async (req, res) => {
    try {
        const { adminComment } = req.body;
        const app = await LeaveApplication.findOne({ _id: req.params.id, school: req.schoolId });
        if (!app) return res.status(404).json({ success: false, message: 'Leave request not found' });
        if (app.status !== 'pending')
            return res.status(400).json({ success: false, message: 'Only pending requests can be sent back for modification' });

        app.status = 'modification_requested';
        app.modificationRequestedAt = new Date();
        app.adminComment = adminComment || '';
        await app.save();
        res.json({ success: true, data: app });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// ── Admin: Allocations ────────────────────────────────────────────────────────

exports.adminGetAllocations = async (req, res) => {
    try {
        const { academicYear } = req.query;
        const ay = academicYear || await getActiveAcademicYearLabel(req.schoolId);
        if (!ay) return res.status(400).json({ success: false, message: 'No active academic year' });

        const [balances, leaveTypes] = await Promise.all([
            LeaveBalance.find({ school: req.schoolId, academicYear: ay })
                .populate('teacher',   'name email employeeId')
                .populate('leaveType', 'name code annualAllocation')
                .lean(),
            LeaveType.find({ school: req.schoolId, isActive: true }).lean(),
        ]);
        res.json({ success: true, data: balances, leaveTypes, academicYear: ay });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.adminAllocate = async (req, res) => {
    try {
        const { teacherId, leaveTypeId, totalAllocated, academicYear } = req.body;
        if (!teacherId || !leaveTypeId || totalAllocated === undefined)
            return res.status(400).json({ success: false, message: 'teacherId, leaveTypeId and totalAllocated are required' });

        const ay = academicYear || await getActiveAcademicYearLabel(req.schoolId);
        if (!ay) return res.status(400).json({ success: false, message: 'No active academic year' });

        const bal = await LeaveBalance.findOneAndUpdate(
            { teacher: teacherId, school: req.schoolId, leaveType: leaveTypeId, academicYear: ay },
            { $set: { totalAllocated: Number(totalAllocated) } },
            { upsert: true, new: true }
        ).populate('leaveType', 'name code').lean();
        res.json({ success: true, data: bal });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.adminGetAllocationTemplate = async (req, res) => {
    try {
        const teachers = await User.find({ school: req.schoolId, role: 'teacher', isActive: true })
            .select('name email employeeId').lean();
        const leaveTypes = await LeaveType.find({ school: req.schoolId, isActive: true }).lean();
        const rows = [];
        teachers.forEach(t => {
            leaveTypes.forEach(lt => {
                rows.push({
                    teacherEmployeeId: t.employeeId || '',
                    teacherName:       t.name,
                    teacherEmail:      t.email,
                    leaveTypeCode:     lt.code,
                    leaveTypeName:     lt.name,
                    totalAllocated:    lt.annualAllocation,
                });
            });
        });
        const wb  = XLSX.utils.book_new();
        const ws  = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, 'Allocations');
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', 'attachment; filename="leave_allocation_template.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.adminBulkAllocateExcel = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
        const wb   = XLSX.read(req.file.buffer, { type: 'buffer' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (!rows.length) return res.status(400).json({ success: false, message: 'File is empty' });

        const ay = req.body.academicYear || await getActiveAcademicYearLabel(req.schoolId);
        if (!ay) return res.status(400).json({ success: false, message: 'No active academic year' });

        const [teachers, leaveTypes] = await Promise.all([
            User.find({ school: req.schoolId, role: 'teacher', isActive: true }).select('name email employeeId').lean(),
            LeaveType.find({ school: req.schoolId, isActive: true }).lean(),
        ]);
        const teacherByEmail = Object.fromEntries(teachers.map(t => [t.email?.toLowerCase(), t]));
        const teacherById    = Object.fromEntries(teachers.map(t => [t.employeeId, t]));
        const ltByCode       = Object.fromEntries(leaveTypes.map(l => [l.code, l]));

        const errors = [];
        const ops    = [];

        rows.forEach((row, i) => {
            const lineNo = i + 2;
            const email  = (row.teacherEmail || '').toString().toLowerCase().trim();
            const empId  = (row.teacherEmployeeId || '').toString().trim();
            const ltCode = (row.leaveTypeCode || '').toString().trim().toUpperCase();
            const alloc  = parseFloat(row.totalAllocated);

            const teacher = teacherByEmail[email] || teacherById[empId];
            if (!teacher) { errors.push(`Row ${lineNo}: teacher not found`); return; }
            const lt = ltByCode[ltCode];
            if (!lt)      { errors.push(`Row ${lineNo}: leave type '${ltCode}' not found`); return; }
            if (isNaN(alloc)) { errors.push(`Row ${lineNo}: invalid totalAllocated`); return; }

            ops.push({
                updateOne: {
                    filter: { teacher: teacher._id, school: req.schoolId, leaveType: lt._id, academicYear: ay },
                    update: { $set: { totalAllocated: alloc } },
                    upsert: true,
                },
            });
        });

        if (ops.length) await LeaveBalance.bulkWrite(ops);
        res.json({ success: true, updated: ops.length, errors: errors.length ? errors : undefined });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.adminRunCarryForward = async (req, res) => {
    try {
        const { fromYear, toYear } = req.body;
        if (!fromYear || !toYear)
            return res.status(400).json({ success: false, message: 'fromYear and toYear are required (e.g. "2024-25", "2025-26")' });

        const leaveTypes = await LeaveType.find({ school: req.schoolId, 'carryForward.enabled': true }).lean();
        if (!leaveTypes.length) return res.json({ success: true, message: 'No carry-forward leave types', processed: 0 });

        let processed = 0;
        for (const lt of leaveTypes) {
            const balances = await LeaveBalance.find({ school: req.schoolId, leaveType: lt._id, academicYear: fromYear }).lean();
            for (const bal of balances) {
                const remaining = Math.max(0, bal.totalAllocated + bal.carriedForward - bal.used - bal.pending);
                const carryAmt  = Math.min(remaining, lt.carryForward.maxDays || remaining);
                if (carryAmt <= 0) continue;
                await LeaveBalance.findOneAndUpdate(
                    { teacher: bal.teacher, school: req.schoolId, leaveType: lt._id, academicYear: toYear },
                    { $inc: { carriedForward: carryAmt }, $setOnInsert: { totalAllocated: lt.annualAllocation, used: 0, pending: 0 } },
                    { upsert: true }
                );
                processed++;
            }
        }
        res.json({ success: true, processed });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// ── Admin: Reports ────────────────────────────────────────────────────────────

exports.adminGetReports = async (req, res) => {
    try {
        const { academicYear, teacherId, leaveType, status } = req.query;
        const ay = academicYear || await getActiveAcademicYearLabel(req.schoolId);

        const filter = { school: req.schoolId };
        if (teacherId) filter.teacher   = teacherId;
        if (leaveType) filter.leaveType = leaveType;
        if (status)    filter.status    = status;

        const [apps, balances] = await Promise.all([
            LeaveApplication.find(filter)
                .populate('teacher',   'name email employeeId')
                .populate('leaveType', 'name code')
                .sort({ appliedAt: -1 })
                .lean(),
            LeaveBalance.find({ school: req.schoolId, academicYear: ay, ...(teacherId ? { teacher: teacherId } : {}) })
                .populate('teacher',   'name email employeeId')
                .populate('leaveType', 'name code')
                .lean(),
        ]);

        const summary = balances.map(b => ({
            teacher:        b.teacher,
            leaveType:      b.leaveType,
            academicYear:   b.academicYear,
            totalAllocated: b.totalAllocated,
            carriedForward: b.carriedForward,
            used:           b.used,
            pending:        b.pending,
            remaining:      Math.max(0, b.totalAllocated + b.carriedForward - b.used - b.pending),
        }));

        res.json({ success: true, data: { applications: apps, summary } });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.adminExportReports = async (req, res) => {
    try {
        const { academicYear, status } = req.query;
        const ay = academicYear || await getActiveAcademicYearLabel(req.schoolId);

        const filter = { school: req.schoolId };
        if (status) filter.status = status;

        const apps = await LeaveApplication.find(filter)
            .populate('teacher',   'name email employeeId')
            .populate('leaveType', 'name code')
            .sort({ appliedAt: -1 })
            .lean();

        const rows = apps.map(a => ({
            employeeId:  a.teacher?.employeeId || '',
            teacher:     a.teacher?.name       || '',
            email:       a.teacher?.email      || '',
            leaveType:   a.leaveType?.name     || '',
            code:        a.leaveType?.code     || '',
            fromDate:    a.fromDate?.toISOString().slice(0, 10) || '',
            toDate:      a.toDate?.toISOString().slice(0, 10)   || '',
            totalDays:   a.totalDays,
            leaveMode:   a.leaveMode,
            status:      a.status,
            reason:      a.reason,
            adminComment:a.adminComment || '',
            appliedAt:   a.appliedAt?.toISOString().slice(0, 10) || '',
        }));

        const wb  = XLSX.utils.book_new();
        const ws  = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, 'Leave Report');
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', 'attachment; filename="leave_report.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// ── Teacher: My Leaves ────────────────────────────────────────────────────────

exports.teacherGetMyLeaves = async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const filter = { teacher: req.userId, school: req.schoolId };
        if (status) filter.status = status;

        const [apps, total] = await Promise.all([
            LeaveApplication.find(filter)
                .populate('leaveType', 'name code')
                .populate('approvedBy','name')
                .sort({ appliedAt: -1 })
                .skip((+page - 1) * +limit)
                .limit(+limit)
                .lean(),
            LeaveApplication.countDocuments(filter),
        ]);
        res.json({ success: true, data: apps, total, page: +page, pages: Math.ceil(total / +limit) });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.teacherGetLeaveBalance = async (req, res) => {
    try {
        const ay = await getActiveAcademicYearLabel(req.schoolId);
        const [balances, leaveTypes] = await Promise.all([
            LeaveBalance.find({ teacher: req.userId, school: req.schoolId, academicYear: ay })
                .populate('leaveType', 'name code annualAllocation requiresDocument maxConsecutiveDays')
                .lean(),
            LeaveType.find({ school: req.schoolId, isActive: true }).lean(),
        ]);

        // Ensure all active leave types have a balance row (for display)
        const balMap = Object.fromEntries(balances.map(b => [b.leaveType?._id?.toString() || b.leaveType?.toString(), b]));
        const result = leaveTypes.map(lt => {
            const b = balMap[lt._id.toString()];
            if (b) {
                return { ...b, remaining: Math.max(0, b.totalAllocated + b.carriedForward - b.used - b.pending) };
            }
            return {
                leaveType:      lt,
                academicYear:   ay,
                totalAllocated: lt.annualAllocation,
                carriedForward: 0,
                used:           0,
                pending:        0,
                remaining:      lt.annualAllocation,
            };
        });
        res.json({ success: true, data: result, academicYear: ay });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.teacherApplyLeave = async (req, res) => {
    try {
        const { leaveTypeId, fromDate, toDate, leaveMode, reason } = req.body;
        if (!leaveTypeId || !fromDate || !toDate || !reason)
            return res.status(400).json({ success: false, message: 'leaveTypeId, fromDate, toDate and reason are required' });

        const lt = await LeaveType.findOne({ _id: leaveTypeId, school: req.schoolId, isActive: true }).lean();
        if (!lt) return res.status(404).json({ success: false, message: 'Leave type not found' });

        const school = await School.findById(req.schoolId).select('leaveSettings').lean();
        const satWorking = school?.leaveSettings?.saturdayWorking !== false;
        const from = new Date(fromDate);
        const to   = new Date(toDate);
        if (to < from) return res.status(400).json({ success: false, message: 'toDate must be on or after fromDate' });

        let totalDays = countWorkingDays(from, to, satWorking);
        if (leaveMode === 'half_day') totalDays = 0.5;

        if (lt.maxConsecutiveDays > 0 && totalDays > lt.maxConsecutiveDays && leaveMode !== 'half_day')
            return res.status(400).json({ success: false, message: `Max consecutive days for this leave type is ${lt.maxConsecutiveDays}` });

        const ay = await getActiveAcademicYearLabel(req.schoolId);
        if (!ay) return res.status(400).json({ success: false, message: 'No active academic year' });

        const bal = await ensureBalance(req.userId, req.schoolId, leaveTypeId, ay);
        const remaining = Math.max(0, bal.totalAllocated + bal.carriedForward - bal.used - bal.pending);
        if (totalDays > remaining)
            return res.status(400).json({ success: false, message: `Insufficient leave balance. Available: ${remaining} day(s)` });

        // Document check
        let documentPath = null;
        if (req.file) documentPath = req.file.path || req.file.filename;
        if (lt.requiresDocument) {
            const afterDays = lt.documentRequiredAfterDays || 0;
            if ((afterDays === 0 || totalDays > afterDays) && !documentPath)
                return res.status(400).json({ success: false, message: 'Document is required for this leave type' });
        }

        const app = await LeaveApplication.create({
            teacher: req.userId, school: req.schoolId, leaveType: leaveTypeId,
            fromDate: from, toDate: to, totalDays,
            leaveMode: leaveMode || 'full_day', reason, document: documentPath, appliedAt: new Date(),
        });
        await LeaveBalance.updateOne(
            { teacher: req.userId, school: req.schoolId, leaveType: leaveTypeId, academicYear: ay },
            { $inc: { pending: totalDays } }
        );
        res.status(201).json({ success: true, data: app });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.teacherCancelLeave = async (req, res) => {
    try {
        const app = await LeaveApplication.findOne({ _id: req.params.id, teacher: req.userId, school: req.schoolId });
        if (!app) return res.status(404).json({ success: false, message: 'Leave request not found' });
        if (!['pending', 'modification_requested'].includes(app.status))
            return res.status(400).json({ success: false, message: 'Only pending applications can be cancelled' });

        const oldStatus = app.status;
        app.status      = 'cancelled';
        app.cancelledAt = new Date();
        await app.save();

        if (oldStatus === 'pending') {
            const ay = await getActiveAcademicYearLabel(req.schoolId);
            await LeaveBalance.updateOne(
                { teacher: req.userId, school: req.schoolId, leaveType: app.leaveType, academicYear: ay },
                { $inc: { pending: -app.totalDays } }
            );
        }
        res.json({ success: true, data: app });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
