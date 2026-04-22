const LeaveType           = require('../models/LeaveType');
const LeaveBalance        = require('../models/LeaveBalance');
const LeaveApplication    = require('../models/LeaveApplication');
const AcademicYear        = require('../models/AcademicYear');
const User                = require('../models/User');
const School              = require('../models/School');
const Holiday             = require('../models/Holiday');
const Notification        = require('../models/Notification');
const NotificationReceipt = require('../models/NotificationReceipt');
const ActivityLog         = require('../models/ActivityLog');
const sseClients          = require('../utils/sseClients');
const xlsx                = require('xlsx');

/* ─────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────── */

function fmtDate(d) {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Sync fallbacks (used only when DB has no active year set)
function _computedCurrentAY() {
    const now = new Date(), y = now.getFullYear();
    return now.getMonth() >= 3
        ? `${y}-${String(y + 1).slice(2)}`
        : `${y - 1}-${String(y).slice(2)}`;
}
function _computedPrevAY() {
    const now = new Date(), y = now.getFullYear();
    return now.getMonth() >= 3
        ? `${y - 1}-${String(y).slice(2)}`
        : `${y - 2}-${String(y - 1).slice(2)}`;
}

// Returns the active academic year's yearName for a school, falls back to computed
async function getActiveAY(schoolId) {
    const ay = await AcademicYear.findOne({ school: schoolId, status: 'active' }).select('yearName').lean();
    return ay ? ay.yearName : _computedCurrentAY();
}

// Returns the most-recently ended (non-active) academic year's yearName, falls back to computed
async function getPrevAY(schoolId) {
    const ay = await AcademicYear.findOne({ school: schoolId, status: { $ne: 'active' } })
        .sort({ endDate: -1 }).select('yearName').lean();
    return ay ? ay.yearName : _computedPrevAY();
}

// Returns carry-forward days for a teacher given a leave type policy and their previous-year balance.
function _computeCarry(lt, prevBal) {
    if (!lt.carryForward || !lt.carryForward.enabled || !prevBal) return 0;
    const leftover = Math.max(0, prevBal.totalAllocated + prevBal.carriedForward - prevBal.used - prevBal.pending);
    return Math.min(leftover, lt.carryForward.maxDays);
}

// Count working days between two dates, inclusive.
// Skips Sundays always, Saturdays when !saturdayWorking, and school holidays
// (scope 'all' or departments includes 'teaching_staff') when holiday module is enabled.
// Returns 0.5 for half-day mode.
async function countWorkingDays(from, to, mode, schoolId) {
    if (mode === 'half_day') return 0.5;

    const school = await School.findById(schoolId)
        .select('leaveSettings modules').lean();
    const saturdayWorking = school?.leaveSettings?.saturdayWorking !== false;
    const holidayModuleOn = !!school?.modules?.holiday;

    const holidaySet = new Set();
    if (holidayModuleOn) {
        const holidays = await Holiday.find({
            school: schoolId,
            startDate: { $lte: to },
            endDate:   { $gte: from },
            $or: [
                { 'applicability.scope': 'all' },
                { 'applicability.scope': 'specific_departments', 'applicability.departments': 'teaching_staff' },
            ],
        }).select('startDate endDate').lean();

        holidays.forEach(h => {
            const cur = new Date(h.startDate);
            const end = new Date(h.endDate);
            while (cur <= end) {
                holidaySet.add(cur.toISOString().split('T')[0]);
                cur.setDate(cur.getDate() + 1);
            }
        });
    }

    let count = 0;
    const cur = new Date(from);
    const end = new Date(to);
    while (cur <= end) {
        const dow = cur.getDay(); // 0=Sun, 6=Sat
        const dateStr = cur.toISOString().split('T')[0];
        if (dow !== 0 && (dow !== 6 || saturdayWorking) && !holidaySet.has(dateStr)) {
            count++;
        }
        cur.setDate(cur.getDate() + 1);
    }
    return Math.max(count, 0);
}

async function logAction(userId, schoolId, actionType, entityId, oldValue, newValue) {
    try {
        await ActivityLog.create({
            user: userId,
            school: schoolId || null,
            actionType,
            entityType: 'LeaveApplication',
            entityId: entityId || null,
            oldValue: oldValue || null,
            newValue: newValue || null,
        });
    } catch (err) {
        console.error('[Leave] ActivityLog write failed:', err.message);
    }
}

async function notifyUsers(recipientIds, title, body, senderUserId, senderRole, schoolId) {
    if (!recipientIds.length) return;
    try {
        const notif = await Notification.create({
            title,
            body,
            sender: senderUserId,
            senderRole,
            school: schoolId,
            channels: { inApp: true, email: false },
            target: { type: 'all_teachers', schools: [] },
            recipientCount: recipientIds.length,
        });
        await NotificationReceipt.insertMany(
            recipientIds.map(rid => ({ notification: notif._id, recipient: rid, school: schoolId })),
            { ordered: false }
        );
        const payload = { title, body, senderRole, createdAt: notif.createdAt };
        sseClients.pushMany(recipientIds.map(id => id.toString()), 'notification', payload);
    } catch (err) {
        console.error('[Leave] Notification failed:', err.message);
    }
}

/* ─────────────────────────────────────────────────────────────
   ADMIN — LEAVE TYPES
───────────────────────────────────────────────────────────── */

exports.adminGetLeaveTypes = async (req, res) => {
    try {
        const [leaveTypes, school] = await Promise.all([
            LeaveType.find({ school: req.session.schoolId }).sort({ name: 1 }).lean(),
            School.findById(req.session.schoolId).select('leaveSettings').lean(),
        ]);
        res.render('admin/leave/types', {
            title: 'Leave Types',
            layout: 'layouts/main',
            leaveTypes,
            saturdayWorking: school?.leaveSettings?.saturdayWorking !== false,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load leave types.');
        res.redirect('/admin/dashboard');
    }
};

exports.adminGetCreateLeaveType = async (req, res) => {
    res.render('admin/leave/type-form', {
        title: 'Create Leave Type',
        layout: 'layouts/main',
        leaveType: null,
    });
};

exports.adminPostCreateLeaveType = async (req, res) => {
    try {
        const {
            name, code, annualAllocation,
            monthlyAccrualEnabled, daysPerMonth,
            carryForwardEnabled, maxCarryDays,
            encashable, maxConsecutiveDays, requiresDocument,
            documentRequiredAfterDays,
        } = req.body;

        await LeaveType.create({
            school: req.session.schoolId,
            name: name.trim(),
            code: code.trim().toUpperCase(),
            annualAllocation: Number(annualAllocation) || 0,
            monthlyAccrual: {
                enabled: monthlyAccrualEnabled === 'on',
                daysPerMonth: Number(daysPerMonth) || 0,
            },
            carryForward: {
                enabled: carryForwardEnabled === 'on',
                maxDays: Number(maxCarryDays) || 0,
            },
            encashable: encashable === 'on',
            maxConsecutiveDays: Number(maxConsecutiveDays) || 0,
            requiresDocument: requiresDocument === 'on',
            documentRequiredAfterDays: requiresDocument === 'on' ? (Number(documentRequiredAfterDays) || 0) : 0,
            createdBy: req.session.userId,
        });

        await logAction(req.session.userId, req.session.schoolId, 'CREATE_LEAVE_TYPE', null, null, { name, code });
        req.flash('success', `Leave type "${name}" created.`);
        res.redirect('/admin/leave/types');
    } catch (err) {
        console.error(err);
        req.flash('error', err.code === 11000 ? 'A leave type with that code already exists.' : err.message);
        res.redirect('/admin/leave/types/create');
    }
};

exports.adminGetEditLeaveType = async (req, res) => {
    try {
        const leaveType = await LeaveType.findOne({ _id: req.params.id, school: req.session.schoolId }).lean();
        if (!leaveType) { req.flash('error', 'Leave type not found.'); return res.redirect('/admin/leave/types'); }
        res.render('admin/leave/type-form', {
            title: 'Edit Leave Type',
            layout: 'layouts/main',
            leaveType,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load leave type.');
        res.redirect('/admin/leave/types');
    }
};

exports.adminPostEditLeaveType = async (req, res) => {
    try {
        const {
            name, code, annualAllocation,
            monthlyAccrualEnabled, daysPerMonth,
            carryForwardEnabled, maxCarryDays,
            encashable, maxConsecutiveDays, requiresDocument,
            documentRequiredAfterDays, isActive,
        } = req.body;

        const lt = await LeaveType.findOne({ _id: req.params.id, school: req.session.schoolId });
        if (!lt) { req.flash('error', 'Leave type not found.'); return res.redirect('/admin/leave/types'); }

        const old = { name: lt.name, code: lt.code };
        lt.name = name.trim();
        lt.code = code.trim().toUpperCase();
        lt.annualAllocation = Number(annualAllocation) || 0;
        lt.monthlyAccrual = { enabled: monthlyAccrualEnabled === 'on', daysPerMonth: Number(daysPerMonth) || 0 };
        lt.carryForward = { enabled: carryForwardEnabled === 'on', maxDays: Number(maxCarryDays) || 0 };
        lt.encashable = encashable === 'on';
        lt.maxConsecutiveDays = Number(maxConsecutiveDays) || 0;
        lt.requiresDocument = requiresDocument === 'on';
        lt.documentRequiredAfterDays = requiresDocument === 'on' ? (Number(documentRequiredAfterDays) || 0) : 0;
        lt.isActive = isActive === 'on';
        await lt.save();

        await logAction(req.session.userId, req.session.schoolId, 'UPDATE_LEAVE_TYPE', lt._id, old, { name, code });
        req.flash('success', `Leave type "${name}" updated.`);
        res.redirect('/admin/leave/types');
    } catch (err) {
        console.error(err);
        req.flash('error', err.message);
        res.redirect('/admin/leave/types');
    }
};

exports.adminPostDeleteLeaveType = async (req, res) => {
    try {
        const lt = await LeaveType.findOne({ _id: req.params.id, school: req.session.schoolId });
        if (!lt) { req.flash('error', 'Leave type not found.'); return res.redirect('/admin/leave/types'); }

        const inUse = await LeaveApplication.countDocuments({ leaveType: lt._id });
        if (inUse > 0) {
            req.flash('error', 'Cannot delete: this leave type has existing applications.');
            return res.redirect('/admin/leave/types');
        }
        await lt.deleteOne();
        await logAction(req.session.userId, req.session.schoolId, 'DELETE_LEAVE_TYPE', lt._id, { name: lt.name }, null);
        req.flash('success', `Leave type "${lt.name}" deleted.`);
        res.redirect('/admin/leave/types');
    } catch (err) {
        console.error(err);
        req.flash('error', err.message);
        res.redirect('/admin/leave/types');
    }
};

/* ─────────────────────────────────────────────────────────────
   ADMIN — LEAVE SETTINGS
───────────────────────────────────────────────────────────── */

exports.adminGetLeaveSettings = async (req, res) => {
    try {
        const school = await School.findById(req.session.schoolId)
            .select('leaveSettings').lean();
        const leaveTypes = await LeaveType.find({ school: req.session.schoolId })
            .sort({ name: 1 }).lean();
        res.render('admin/leave/types', {
            title: 'Leave Types',
            layout: 'layouts/main',
            leaveTypes,
            saturdayWorking: school?.leaveSettings?.saturdayWorking !== false,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load leave settings.');
        res.redirect('/admin/leave/types');
    }
};

exports.adminPostLeaveSettings = async (req, res) => {
    try {
        const saturdayWorking = req.body.saturdayWorking === 'true';
        await School.findByIdAndUpdate(req.session.schoolId, {
            'leaveSettings.saturdayWorking': saturdayWorking,
        });
        await logAction(req.session.userId, req.session.schoolId, 'UPDATE_LEAVE_SETTINGS', null,
            null, { saturdayWorking });
        req.flash('success', 'Leave settings saved.');
        res.redirect('/admin/leave/types');
    } catch (err) {
        console.error(err);
        req.flash('error', err.message);
        res.redirect('/admin/leave/types');
    }
};

/* ─────────────────────────────────────────────────────────────
   ADMIN — ALLOCATIONS
───────────────────────────────────────────────────────────── */

exports.adminGetAllocations = async (req, res) => {
    try {
        const ay = await getActiveAY(req.session.schoolId);
        const [teachers, leaveTypes, balances] = await Promise.all([
            User.find({ school: req.session.schoolId, role: 'teacher', isActive: true })
                .select('name email').sort({ name: 1 }).lean(),
            LeaveType.find({ school: req.session.schoolId, isActive: true })
                .sort({ name: 1 }).lean(),
            LeaveBalance.find({ school: req.session.schoolId, academicYear: ay })
                .populate('teacher', 'name email')
                .populate('leaveType', 'name code')
                .lean(),
        ]);

        // Build a map: teacherId → { leaveTypeId → balance }
        const balanceMap = {};
        balances.forEach(b => {
            const tid = b.teacher?._id?.toString();
            const ltid = b.leaveType?._id?.toString();
            if (!tid || !ltid) return;
            if (!balanceMap[tid]) balanceMap[tid] = {};
            balanceMap[tid][ltid] = b;
        });

        res.render('admin/leave/allocations', {
            title: 'Leave Allocations',
            layout: 'layouts/main',
            teachers,
            leaveTypes,
            balanceMap,
            academicYear: ay,
            previousYear: await getPrevAY(req.session.schoolId),
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load allocations.');
        res.redirect('/admin/leave/requests');
    }
};

exports.adminPostAllocate = async (req, res) => {
    try {
        const { teacherId, leaveTypeId, totalDays, scope } = req.body;
        const [ay, prevAY] = await Promise.all([
            getActiveAY(req.session.schoolId),
            getPrevAY(req.session.schoolId),
        ]);

        // Load the leave type to check carry-forward policy
        const lt = await LeaveType.findOne({ _id: leaveTypeId, school: req.session.schoolId }).lean();
        if (!lt) { req.flash('error', 'Leave type not found.'); return res.redirect('/admin/leave/allocations'); }

        if (scope === 'bulk') {
            const teachers = await User.find({ school: req.session.schoolId, role: 'teacher', isActive: true }).select('_id');

            // Fetch all previous-year balances for this leave type in one query
            let prevBalMap = {};
            if (lt.carryForward && lt.carryForward.enabled) {
                const prevBals = await LeaveBalance.find({
                    school: req.session.schoolId,
                    leaveType: leaveTypeId,
                    academicYear: prevAY,
                }).lean();
                prevBals.forEach(b => { prevBalMap[b.teacher.toString()] = b; });
            }

            const ops = teachers.map(t => {
                const prevBal  = prevBalMap[t._id.toString()];
                const carry    = _computeCarry(lt, prevBal);
                return {
                    updateOne: {
                        filter: { teacher: t._id, school: req.session.schoolId, leaveType: leaveTypeId, academicYear: ay },
                        update: {
                            $set:         { totalAllocated: Number(totalDays) || 0, carriedForward: carry },
                            $setOnInsert: { used: 0, pending: 0 },
                        },
                        upsert: true,
                    },
                };
            });

            await LeaveBalance.bulkWrite(ops);
            await logAction(req.session.userId, req.session.schoolId, 'BULK_ALLOCATE_LEAVE', null, null, { leaveTypeId, totalDays, ay });
            req.flash('success', `Bulk allocation complete for ${teachers.length} teacher(s) (carry-forward applied automatically).`);
        } else {
            // Individual
            let carry = 0;
            if (lt.carryForward && lt.carryForward.enabled) {
                const prevBal = await LeaveBalance.findOne({
                    teacher: teacherId, school: req.session.schoolId,
                    leaveType: leaveTypeId, academicYear: prevAY,
                }).lean();
                carry = _computeCarry(lt, prevBal);
            }

            await LeaveBalance.findOneAndUpdate(
                { teacher: teacherId, school: req.session.schoolId, leaveType: leaveTypeId, academicYear: ay },
                {
                    $set:         { totalAllocated: Number(totalDays) || 0, carriedForward: carry },
                    $setOnInsert: { used: 0, pending: 0 },
                },
                { upsert: true, new: true }
            );
            await logAction(req.session.userId, req.session.schoolId, 'ALLOCATE_LEAVE', null, null, { teacherId, leaveTypeId, totalDays, carry, ay });
            req.flash('success', `Leave allocated.${carry > 0 ? ` ${carry} day(s) carried forward from ${prevAY}.` : ''}`);
        }
        res.redirect('/admin/leave/allocations');
    } catch (err) {
        console.error(err);
        req.flash('error', err.message);
        res.redirect('/admin/leave/allocations');
    }
};

/* ─────────────────────────────────────────────────────────────
   ADMIN — REQUESTS (LIST + APPROVE / REJECT)
───────────────────────────────────────────────────────────── */

exports.adminGetRequests = async (req, res) => {
    try {
        const { status = '', teacherId = '', leaveTypeId = '', from = '', to = '' } = req.query;
        const filter = { school: req.session.schoolId };
        if (status) filter.status = status;
        if (teacherId) filter.teacher = teacherId;
        if (leaveTypeId) filter.leaveType = leaveTypeId;
        if (from || to) {
            filter.fromDate = {};
            if (from) filter.fromDate.$gte = new Date(from);
            if (to)   filter.fromDate.$lte = new Date(to);
        }

        const [applications, teachers, leaveTypes] = await Promise.all([
            LeaveApplication.find(filter)
                .populate('teacher', 'name email')
                .populate('leaveType', 'name code')
                .populate('approvedBy', 'name')
                .sort({ appliedAt: -1 })
                .lean(),
            User.find({ school: req.session.schoolId, role: 'teacher', isActive: true })
                .select('name').sort({ name: 1 }).lean(),
            LeaveType.find({ school: req.session.schoolId })
                .select('name code').sort({ name: 1 }).lean(),
        ]);

        res.render('admin/leave/requests', {
            title: 'Leave Requests',
            layout: 'layouts/main',
            applications,
            teachers,
            leaveTypes,
            filters: { status, teacherId, leaveTypeId, from, to },
            fmtDate,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load requests.');
        res.redirect('/admin/dashboard');
    }
};

exports.adminPostApproveRequest = async (req, res) => {
    try {
        const app = await LeaveApplication.findOne({ _id: req.params.id, school: req.session.schoolId })
            .populate('teacher', 'name _id')
            .populate('leaveType', 'name');
        if (!app) { req.flash('error', 'Application not found.'); return res.redirect('/admin/leave/requests'); }
        if (app.status !== 'pending' && app.status !== 'modification_requested') {
            req.flash('error', 'Only pending applications can be approved.');
            return res.redirect('/admin/leave/requests');
        }

        const ay = await getActiveAY(req.session.schoolId);
        // Deduct from balance
        await LeaveBalance.findOneAndUpdate(
            { teacher: app.teacher._id, school: app.school, leaveType: app.leaveType._id, academicYear: ay },
            { $inc: { used: app.totalDays, pending: -app.totalDays } }
        );

        app.status = 'approved';
        app.approvedBy = req.session.userId;
        app.approvedAt = new Date();
        app.adminComment = req.body.comment || '';
        await app.save();

        await logAction(req.session.userId, req.session.schoolId, 'APPROVE_LEAVE', app._id, { status: 'pending' }, { status: 'approved' });

        // Notify teacher
        await notifyUsers(
            [app.teacher._id],
            'Leave Approved',
            `Your ${app.leaveType.name} from ${fmtDate(app.fromDate)} to ${fmtDate(app.toDate)} has been approved.`,
            req.session.userId, 'school_admin', req.session.schoolId
        );

        req.flash('success', `Leave approved for ${app.teacher.name}.`);
        res.redirect('/admin/leave/requests');
    } catch (err) {
        console.error(err);
        req.flash('error', err.message);
        res.redirect('/admin/leave/requests');
    }
};

exports.adminPostRejectRequest = async (req, res) => {
    try {
        const { comment } = req.body;
        if (!comment || !comment.trim()) {
            req.flash('error', 'A comment is required when rejecting a leave.');
            return res.redirect('/admin/leave/requests');
        }

        const app = await LeaveApplication.findOne({ _id: req.params.id, school: req.session.schoolId })
            .populate('teacher', 'name _id')
            .populate('leaveType', 'name');
        if (!app) { req.flash('error', 'Application not found.'); return res.redirect('/admin/leave/requests'); }
        if (app.status !== 'pending' && app.status !== 'modification_requested') {
            req.flash('error', 'Only pending applications can be rejected.');
            return res.redirect('/admin/leave/requests');
        }

        const ay = await getActiveAY(req.session.schoolId);
        // Restore pending days
        await LeaveBalance.findOneAndUpdate(
            { teacher: app.teacher._id, school: app.school, leaveType: app.leaveType._id, academicYear: ay },
            { $inc: { pending: -app.totalDays } }
        );

        app.status = 'rejected';
        app.adminComment = comment.trim();
        app.rejectedAt = new Date();
        await app.save();

        await logAction(req.session.userId, req.session.schoolId, 'REJECT_LEAVE', app._id, { status: 'pending' }, { status: 'rejected', comment });

        await notifyUsers(
            [app.teacher._id],
            'Leave Rejected',
            `Your ${app.leaveType.name} from ${fmtDate(app.fromDate)} to ${fmtDate(app.toDate)} was rejected. Reason: ${comment}`,
            req.session.userId, 'school_admin', req.session.schoolId
        );

        req.flash('success', `Leave rejected for ${app.teacher.name}.`);
        res.redirect('/admin/leave/requests');
    } catch (err) {
        console.error(err);
        req.flash('error', err.message);
        res.redirect('/admin/leave/requests');
    }
};

exports.adminPostRequestModification = async (req, res) => {
    try {
        const { comment } = req.body;
        if (!comment || !comment.trim()) {
            req.flash('error', 'Please provide modification instructions.');
            return res.redirect('/admin/leave/requests');
        }

        const app = await LeaveApplication.findOne({ _id: req.params.id, school: req.session.schoolId })
            .populate('teacher', 'name _id')
            .populate('leaveType', 'name');
        if (!app) { req.flash('error', 'Application not found.'); return res.redirect('/admin/leave/requests'); }

        app.status = 'modification_requested';
        app.adminComment = comment.trim();
        app.modificationRequestedAt = new Date();
        await app.save();

        await notifyUsers(
            [app.teacher._id],
            'Leave Modification Requested',
            `Modification requested for your ${app.leaveType.name} application. Admin note: ${comment}`,
            req.session.userId, 'school_admin', req.session.schoolId
        );

        req.flash('success', 'Modification request sent.');
        res.redirect('/admin/leave/requests');
    } catch (err) {
        console.error(err);
        req.flash('error', err.message);
        res.redirect('/admin/leave/requests');
    }
};

/* ─────────────────────────────────────────────────────────────
   ADMIN — APPLY LEAVE ON BEHALF OF TEACHER
───────────────────────────────────────────────────────────── */

exports.adminGetApplyLeave = async (req, res) => {
    try {
        const [teachers, leaveTypes, school] = await Promise.all([
            User.find({ school: req.session.schoolId, role: 'teacher', isActive: true })
                .select('name email').sort({ name: 1 }).lean(),
            LeaveType.find({ school: req.session.schoolId, isActive: true })
                .sort({ name: 1 }).lean(),
            School.findById(req.session.schoolId).select('leaveSettings modules').lean(),
        ]);

        const saturdayWorking = school?.leaveSettings?.saturdayWorking !== false;

        const holidayDates = [];
        if (school?.modules?.holiday) {
            const now = new Date();
            const rangeEnd = new Date(now);
            rangeEnd.setFullYear(rangeEnd.getFullYear() + 1);
            const holidays = await Holiday.find({
                school: req.session.schoolId,
                startDate: { $lte: rangeEnd },
                endDate:   { $gte: now },
                $or: [
                    { 'applicability.scope': 'all' },
                    { 'applicability.scope': 'specific_departments', 'applicability.departments': 'teaching_staff' },
                ],
            }).select('startDate endDate').lean();
            holidays.forEach(h => {
                const cur = new Date(h.startDate);
                const end = new Date(h.endDate);
                while (cur <= end) {
                    holidayDates.push(cur.toISOString().split('T')[0]);
                    cur.setDate(cur.getDate() + 1);
                }
            });
        }

        res.render('admin/leave/apply', {
            title: 'Apply Leave for Teacher',
            layout: 'layouts/main',
            teachers,
            leaveTypes,
            saturdayWorking,
            holidayDates,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load form.');
        res.redirect('/admin/leave/requests');
    }
};

exports.adminPostApplyLeave = async (req, res) => {
    try {
        const { teacherId, leaveTypeId, fromDate, toDate, leaveMode, reason } = req.body;

        if (!teacherId || !leaveTypeId || !fromDate || !toDate || !reason) {
            req.flash('error', 'All required fields must be filled.');
            return res.redirect('/admin/leave/requests/apply');
        }

        const [teacher, lt] = await Promise.all([
            User.findOne({ _id: teacherId, school: req.session.schoolId, role: 'teacher' }).select('name _id').lean(),
            LeaveType.findOne({ _id: leaveTypeId, school: req.session.schoolId, isActive: true }).lean(),
        ]);
        if (!teacher) { req.flash('error', 'Teacher not found.'); return res.redirect('/admin/leave/requests/apply'); }
        if (!lt)      { req.flash('error', 'Invalid leave type.'); return res.redirect('/admin/leave/requests/apply'); }

        const from = new Date(fromDate);
        const to   = new Date(toDate);
        if (from > to) {
            req.flash('error', 'From date must be before or equal to To date.');
            return res.redirect('/admin/leave/requests/apply');
        }

        const totalDays = leaveMode === 'half_day'
            ? 0.5
            : await countWorkingDays(from, to, leaveMode, req.session.schoolId);

        if (totalDays === 0) {
            req.flash('error', 'The selected date range contains no working days.');
            return res.redirect('/admin/leave/requests/apply');
        }

        // Check overlapping leave for this teacher
        const overlap = await LeaveApplication.findOne({
            teacher: teacherId,
            school:  req.session.schoolId,
            status:  { $in: ['pending', 'approved', 'modification_requested'] },
            $or: [{ fromDate: { $lte: to }, toDate: { $gte: from } }],
        });
        if (overlap) {
            req.flash('error', `${teacher.name} already has a leave application overlapping these dates.`);
            return res.redirect('/admin/leave/requests/apply');
        }

        const ay = await getActiveAY(req.session.schoolId);

        // Create as already-approved — no balance restriction
        const app = await LeaveApplication.create({
            teacher:     teacherId,
            school:      req.session.schoolId,
            leaveType:   leaveTypeId,
            fromDate:    from,
            toDate:      to,
            totalDays,
            leaveMode:   leaveMode || 'full_day',
            reason:      reason.trim(),
            status:      'approved',
            approvedBy:  req.session.userId,
            approvedAt:  new Date(),
            adminComment: 'Applied directly by admin.',
        });

        // Increment used directly (bypass balance check, upsert if no balance exists)
        await LeaveBalance.findOneAndUpdate(
            { teacher: teacherId, school: req.session.schoolId, leaveType: leaveTypeId, academicYear: ay },
            { $inc: { used: totalDays }, $setOnInsert: { totalAllocated: 0, carriedForward: 0, pending: 0 } },
            { upsert: true }
        );

        await logAction(req.session.userId, req.session.schoolId, 'ADMIN_APPLY_LEAVE', app._id, null,
            { teacher: teacher.name, leaveType: lt.name, fromDate, toDate, totalDays });

        // Notify the teacher
        await notifyUsers(
            [teacherId],
            'Leave Applied by Admin',
            `Admin has recorded ${lt.name} leave for you from ${fmtDate(from)} to ${fmtDate(to)} (${totalDays} day(s)). Reason: ${reason.trim()}`,
            req.session.userId, 'school_admin', req.session.schoolId
        );

        req.flash('success', `Leave applied for ${teacher.name} — ${totalDays} day(s) of ${lt.name}.`);
        res.redirect('/admin/leave/requests');
    } catch (err) {
        console.error(err);
        req.flash('error', err.message);
        res.redirect('/admin/leave/requests/apply');
    }
};

/* ─────────────────────────────────────────────────────────────
   ADMIN — API: TEACHER BALANCE (for admin apply-leave sidebar)
───────────────────────────────────────────────────────────── */

exports.adminApiTeacherBalance = async (req, res) => {
    try {
        const { teacherId } = req.query;
        if (!teacherId) return res.json({ balances: [] });

        const ay = await getActiveAY(req.session.schoolId);
        const balances = await LeaveBalance.find({
            teacher: teacherId, school: req.session.schoolId, academicYear: ay,
        }).populate('leaveType', 'name code').lean();

        res.json({
            balances: balances.map(b => ({
                leaveTypeName: b.leaveType?.name || '—',
                leaveTypeCode: b.leaveType?.code || '—',
                totalAllocated: b.totalAllocated,
                carriedForward: b.carriedForward,
                used:           b.used,
                pending:        b.pending,
                remaining:      b.totalAllocated + b.carriedForward - b.used - b.pending,
            })),
        });
    } catch (err) {
        res.status(500).json({ balances: [] });
    }
};

/* ─────────────────────────────────────────────────────────────
   ADMIN — REPORTS
───────────────────────────────────────────────────────────── */

exports.adminGetReports = async (req, res) => {
    try {
        const ay = await getActiveAY(req.session.schoolId);

        const [applications, leaveTypes, balances] = await Promise.all([
            LeaveApplication.find({ school: req.session.schoolId })
                .populate('teacher', 'name email')
                .populate('leaveType', 'name code')
                .sort({ fromDate: -1 })
                .lean(),
            LeaveType.find({ school: req.session.schoolId }).lean(),
            LeaveBalance.find({ school: req.session.schoolId, academicYear: ay })
                .populate('teacher', 'name')
                .populate('leaveType', 'name code')
                .lean(),
        ]);

        // Usage by leave type
        const usageByType = {};
        leaveTypes.forEach(lt => { usageByType[lt._id.toString()] = { name: lt.name, code: lt.code, days: 0, count: 0 }; });
        applications.filter(a => a.status === 'approved').forEach(a => {
            const key = a.leaveType?._id?.toString();
            if (key && usageByType[key]) {
                usageByType[key].days  += a.totalDays;
                usageByType[key].count += 1;
            }
        });

        // Teacher-wise summary
        const teacherMap = {};
        applications.filter(a => a.status === 'approved').forEach(a => {
            const tid = a.teacher?._id?.toString();
            if (!tid) return;
            if (!teacherMap[tid]) teacherMap[tid] = { name: a.teacher.name, totalDays: 0, count: 0 };
            teacherMap[tid].totalDays += a.totalDays;
            teacherMap[tid].count     += 1;
        });
        const teacherStats = Object.values(teacherMap).sort((a, b) => b.totalDays - a.totalDays);

        // Month-wise usage (current calendar year)
        const monthlyUsage = Array(12).fill(0);
        applications.filter(a => a.status === 'approved').forEach(a => {
            const m = new Date(a.fromDate).getMonth();
            monthlyUsage[m] += a.totalDays;
        });

        res.render('admin/leave/reports', {
            title: 'Leave Reports',
            layout: 'layouts/main',
            usageByType: Object.values(usageByType),
            teacherStats,
            monthlyUsage,
            applications,
            balances,
            academicYear: ay,
            fmtDate,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load reports.');
        res.redirect('/admin/leave/requests');
    }
};

exports.adminExportReports = async (req, res) => {
    try {
        const applications = await LeaveApplication.find({ school: req.session.schoolId })
            .populate('teacher', 'name email')
            .populate('leaveType', 'name code')
            .populate('approvedBy', 'name')
            .sort({ fromDate: -1 })
            .lean();

        const rows = applications.map(a => ({
            Teacher: a.teacher?.name || '',
            Email: a.teacher?.email || '',
            'Leave Type': a.leaveType?.name || '',
            Code: a.leaveType?.code || '',
            'From Date': fmtDate(a.fromDate),
            'To Date': fmtDate(a.toDate),
            Days: a.totalDays,
            Mode: a.leaveMode === 'half_day' ? 'Half Day' : 'Full Day',
            Status: a.status,
            Reason: a.reason,
            'Admin Comment': a.adminComment || '',
            'Applied At': fmtDate(a.appliedAt),
            'Approved By': a.approvedBy?.name || '',
        }));

        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(rows);
        xlsx.utils.book_append_sheet(wb, ws, 'Leave Report');
        const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', 'attachment; filename="leave-report.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Export failed.');
        res.redirect('/admin/leave/reports');
    }
};

/* ─────────────────────────────────────────────────────────────
   ADMIN — EXCEL ALLOCATION TEMPLATE + BULK UPLOAD
───────────────────────────────────────────────────────────── */

exports.adminGetAllocationTemplate = async (req, res) => {
    try {
        const [teachers, leaveTypes] = await Promise.all([
            User.find({ school: req.session.schoolId, role: 'teacher', isActive: true })
                .select('name email').sort({ name: 1 }).lean(),
            LeaveType.find({ school: req.session.schoolId, isActive: true })
                .select('name code annualAllocation').sort({ name: 1 }).lean(),
        ]);

        const wb = xlsx.utils.book_new();

        // Sheet 1: allocation template — one row per teacher × leave type
        const rows = [];
        teachers.forEach(t => {
            leaveTypes.forEach(lt => {
                rows.push({
                    'Teacher Email': t.email,
                    'Teacher Name': t.name,
                    'Leave Type Code': lt.code,
                    'Leave Type Name': lt.name,
                    'Total Days': lt.annualAllocation,
                });
            });
        });

        const wsData = xlsx.utils.json_to_sheet(rows.length ? rows : [{
            'Teacher Email': 'teacher@example.com',
            'Teacher Name': 'Example Teacher',
            'Leave Type Code': 'CL',
            'Leave Type Name': 'Casual Leave',
            'Total Days': 12,
        }]);
        xlsx.utils.book_append_sheet(wb, wsData, 'Allocations');

        // Sheet 2: reference — valid leave type codes
        const refRows = leaveTypes.map(lt => ({ Code: lt.code, Name: lt.name, 'Default Days': lt.annualAllocation }));
        if (refRows.length) {
            xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(refRows), 'Leave Types (Reference)');
        }

        const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', `attachment; filename="leave-allocation-template-${await getActiveAY(req.session.schoolId)}.xlsx"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to generate template.');
        res.redirect('/admin/leave/allocations');
    }
};

exports.adminPostBulkAllocateExcel = async (req, res) => {
    try {
        if (!req.file) {
            req.flash('error', 'Please upload an Excel file.');
            return res.redirect('/admin/leave/allocations');
        }

        const wb = xlsx.read(req.file.buffer, { type: 'buffer' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = xlsx.utils.sheet_to_json(ws);

        if (!rows.length) {
            req.flash('error', 'The uploaded file is empty.');
            return res.redirect('/admin/leave/allocations');
        }

        const ay = await getActiveAY(req.session.schoolId);

        // Pre-fetch teachers and leave types for this school
        const prevAY = await getPrevAY(req.session.schoolId);

        const [allTeachers, allLeaveTypes] = await Promise.all([
            User.find({ school: req.session.schoolId, role: 'teacher', isActive: true })
                .select('_id email').lean(),
            LeaveType.find({ school: req.session.schoolId, isActive: true })
                .select('_id code carryForward').lean(),
        ]);

        const teacherByEmail = {};
        allTeachers.forEach(t => { teacherByEmail[t.email.toLowerCase()] = t._id; });

        const leaveTypeByCode = {};
        allLeaveTypes.forEach(lt => { leaveTypeByCode[lt.code.toUpperCase()] = lt; });

        // Fetch all relevant previous-year balances in one query
        const ltIdsWithCF = allLeaveTypes
            .filter(lt => lt.carryForward && lt.carryForward.enabled)
            .map(lt => lt._id);

        const prevBalMap = {};   // key: `${teacherId}:${leaveTypeId}`
        if (ltIdsWithCF.length) {
            const prevBals = await LeaveBalance.find({
                school: req.session.schoolId,
                leaveType: { $in: ltIdsWithCF },
                academicYear: prevAY,
            }).lean();
            prevBals.forEach(b => { prevBalMap[`${b.teacher}:${b.leaveType}`] = b; });
        }

        const ops = [];
        const errors = [];

        rows.forEach((row, i) => {
            const email = String(row['Teacher Email'] || '').trim().toLowerCase();
            const code  = String(row['Leave Type Code'] || '').trim().toUpperCase();
            const days  = parseFloat(row['Total Days']) || 0;

            const tid = teacherByEmail[email];
            const lt  = leaveTypeByCode[code];

            if (!tid) { errors.push(`Row ${i + 2}: teacher email "${email}" not found.`); return; }
            if (!lt)  { errors.push(`Row ${i + 2}: leave type code "${code}" not found.`); return; }

            const prevBal = prevBalMap[`${tid}:${lt._id}`] || null;
            const carry   = _computeCarry(lt, prevBal);

            ops.push({
                updateOne: {
                    filter: { teacher: tid, school: req.session.schoolId, leaveType: lt._id, academicYear: ay },
                    update: {
                        $set:         { totalAllocated: days, carriedForward: carry },
                        $setOnInsert: { used: 0, pending: 0 },
                    },
                    upsert: true,
                },
            });
        });

        if (ops.length) await LeaveBalance.bulkWrite(ops);

        await logAction(req.session.userId, req.session.schoolId, 'EXCEL_ALLOCATE_LEAVE', null, null,
            { rows: ops.length, errors: errors.length, ay });

        const msg = `${ops.length} allocation(s) saved for ${ay}.`
            + (errors.length ? ` ${errors.length} row(s) skipped: ${errors.slice(0, 3).join(' | ')}` : '');
        req.flash(errors.length && !ops.length ? 'error' : 'success', msg);
        res.redirect('/admin/leave/allocations');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Excel import failed: ' + err.message);
        res.redirect('/admin/leave/allocations');
    }
};

/* ─────────────────────────────────────────────────────────────
   ADMIN — YEAR-END CARRY FORWARD
───────────────────────────────────────────────────────────── */

exports.adminPostRunCarryForward = async (req, res) => {
    try {
        const prevAY = await getPrevAY(req.session.schoolId);
        const currAY = await getActiveAY(req.session.schoolId);

        // Only leave types that have carry-forward enabled for this school
        const leaveTypes = await LeaveType.find({
            school: req.session.schoolId,
            isActive: true,
            'carryForward.enabled': true,
        }).lean();

        if (!leaveTypes.length) {
            req.flash('error', 'No leave types have carry-forward enabled. Enable it in Leave Types settings first.');
            return res.redirect('/admin/leave/allocations');
        }

        // Fetch all previous-year balances for this school for those leave types
        const ltIds = leaveTypes.map(lt => lt._id);
        const prevBalances = await LeaveBalance.find({
            school: req.session.schoolId,
            academicYear: prevAY,
            leaveType: { $in: ltIds },
        }).lean();

        if (!prevBalances.length) {
            req.flash('error', `No leave balances found for ${prevAY}. Nothing to carry forward.`);
            return res.redirect('/admin/leave/allocations');
        }

        // Map leaveTypeId → policy for quick lookup
        const ltMap = {};
        leaveTypes.forEach(lt => { ltMap[lt._id.toString()] = lt; });

        const ops = [];
        let skipped = 0;

        prevBalances.forEach(bal => {
            const lt = ltMap[bal.leaveType.toString()];
            if (!lt) { skipped++; return; }

            // Days left at end of previous year (used+pending subtracted)
            const leftover = Math.max(0, bal.totalAllocated + bal.carriedForward - bal.used - bal.pending);
            if (leftover <= 0) { skipped++; return; }

            const carryAmount = Math.min(leftover, lt.carryForward.maxDays);
            if (carryAmount <= 0) { skipped++; return; }

            ops.push({
                updateOne: {
                    filter: {
                        teacher: bal.teacher,
                        school:  req.session.schoolId,
                        leaveType: bal.leaveType,
                        academicYear: currAY,
                    },
                    update: {
                        $set:         { carriedForward: carryAmount },
                        $setOnInsert: { totalAllocated: 0, used: 0, pending: 0 },
                    },
                    upsert: true,
                },
            });
        });

        if (!ops.length) {
            req.flash('error', `All teachers have 0 leave left from ${prevAY}. Nothing to carry forward.`);
            return res.redirect('/admin/leave/allocations');
        }

        await LeaveBalance.bulkWrite(ops);

        await logAction(req.session.userId, req.session.schoolId, 'CARRY_FORWARD_LEAVE', null, null,
            { fromYear: prevAY, toYear: currAY, processed: ops.length, skipped });

        req.flash('success',
            `Carry-forward complete: ${ops.length} teacher-leave balance(s) updated from ${prevAY} → ${currAY}. ${skipped} skipped (0 days left or no policy).`
        );
        res.redirect('/admin/leave/allocations');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Carry-forward failed: ' + err.message);
        res.redirect('/admin/leave/allocations');
    }
};

/* ─────────────────────────────────────────────────────────────
   TEACHER — LEAVE BALANCE
───────────────────────────────────────────────────────────── */

exports.teacherGetLeaveBalance = async (req, res) => {
    try {
        const ay = await getActiveAY(req.session.schoolId);
        const balances = await LeaveBalance.find({
            teacher: req.session.userId,
            school: req.session.schoolId,
            academicYear: ay,
        }).populate('leaveType', 'name code annualAllocation').lean();

        // Attach remaining virtual
        balances.forEach(b => {
            b.remaining = Math.max(0, b.totalAllocated + b.carriedForward - b.used - b.pending);
        });

        res.render('teacher/leave/balance', {
            title: 'My Leave Balance',
            layout: 'layouts/main',
            balances,
            academicYear: ay,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load leave balance.');
        res.redirect('/teacher/leave');
    }
};

/* ─────────────────────────────────────────────────────────────
   TEACHER — MY LEAVES (LIST)
───────────────────────────────────────────────────────────── */

exports.teacherGetMyLeaves = async (req, res) => {
    try {
        const { status = '' } = req.query;
        const filter = { teacher: req.session.userId, school: req.session.schoolId };
        if (status) filter.status = status;

        const ay = await getActiveAY(req.session.schoolId);
        const [applications, balances, leaveTypes] = await Promise.all([
            LeaveApplication.find(filter)
                .populate('leaveType', 'name code')
                .populate('approvedBy', 'name')
                .sort({ appliedAt: -1 })
                .lean(),
            LeaveBalance.find({ teacher: req.session.userId, school: req.session.schoolId, academicYear: ay })
                .populate('leaveType', 'name code')
                .lean(),
            LeaveType.find({ school: req.session.schoolId, isActive: true })
                .select('name code').lean(),
        ]);

        balances.forEach(b => {
            b.remaining = Math.max(0, b.totalAllocated + b.carriedForward - b.used - b.pending);
        });

        res.render('teacher/leave/index', {
            title: 'My Leaves',
            layout: 'layouts/main',
            applications,
            balances,
            leaveTypes,
            filters: { status },
            fmtDate,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load leaves.');
        res.redirect('/teacher/dashboard');
    }
};

/* ─────────────────────────────────────────────────────────────
   TEACHER — APPLY LEAVE
───────────────────────────────────────────────────────────── */

exports.teacherGetApplyLeave = async (req, res) => {
    try {
        const ay = await getActiveAY(req.session.schoolId);
        const [leaveTypes, balances, school] = await Promise.all([
            LeaveType.find({ school: req.session.schoolId, isActive: true }).sort({ name: 1 }).lean(),
            LeaveBalance.find({ teacher: req.session.userId, school: req.session.schoolId, academicYear: ay })
                .populate('leaveType', 'name code')
                .lean(),
            School.findById(req.session.schoolId).select('leaveSettings modules').lean(),
        ]);

        const balanceMap = {};
        balances.forEach(b => {
            b.remaining = Math.max(0, b.totalAllocated + b.carriedForward - b.used - b.pending);
            balanceMap[b.leaveType._id.toString()] = b;
        });

        const saturdayWorking = school?.leaveSettings?.saturdayWorking !== false;

        // Build a set of holiday date strings (YYYY-MM-DD) for the next 12 months so the
        // frontend can accurately exclude them from the live day count.
        const holidayDates = [];
        if (school?.modules?.holiday) {
            const now = new Date();
            const rangeEnd = new Date(now);
            rangeEnd.setFullYear(rangeEnd.getFullYear() + 1);
            const holidays = await Holiday.find({
                school: req.session.schoolId,
                startDate: { $lte: rangeEnd },
                endDate:   { $gte: now },
                $or: [
                    { 'applicability.scope': 'all' },
                    { 'applicability.scope': 'specific_departments', 'applicability.departments': 'teaching_staff' },
                ],
            }).select('startDate endDate').lean();

            holidays.forEach(h => {
                const cur = new Date(h.startDate);
                const end = new Date(h.endDate);
                while (cur <= end) {
                    holidayDates.push(cur.toISOString().split('T')[0]);
                    cur.setDate(cur.getDate() + 1);
                }
            });
        }

        res.render('teacher/leave/apply', {
            title: 'Apply for Leave',
            layout: 'layouts/main',
            leaveTypes,
            balanceMap,
            prefillDate: req.query.date || '',
            saturdayWorking,
            holidayDates,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load leave form.');
        res.redirect('/teacher/leave');
    }
};

exports.teacherPostApplyLeave = async (req, res) => {
    try {
        const { leaveTypeId, fromDate, toDate, leaveMode, reason } = req.body;
        const documentPath = req.file ? `/uploads/leave-docs/${req.file.filename}` : null;

        if (!leaveTypeId || !fromDate || !toDate || !reason) {
            req.flash('error', 'All required fields must be filled.');
            return res.redirect('/teacher/leave/apply');
        }

        const lt = await LeaveType.findOne({ _id: leaveTypeId, school: req.session.schoolId, isActive: true });
        if (!lt) { req.flash('error', 'Invalid leave type.'); return res.redirect('/teacher/leave/apply'); }

        const from = new Date(fromDate);
        const to   = new Date(toDate);
        if (from > to) { req.flash('error', 'From date must be before or equal to To date.'); return res.redirect('/teacher/leave/apply'); }

        const totalDays = await countWorkingDays(from, to, leaveMode, req.session.schoolId);

        if (totalDays === 0) {
            req.flash('error', 'The selected date range contains no working days (all days are weekends or holidays).');
            return res.redirect('/teacher/leave/apply');
        }

        // Document is required when: requiresDocument is ON, AND either threshold is 0 (always) or totalDays exceeds threshold
        const docThreshold = lt.documentRequiredAfterDays || 0;
        const docMandatory = lt.requiresDocument && (docThreshold === 0 || totalDays > docThreshold);
        if (docMandatory && !documentPath) {
            const msg = docThreshold > 0
                ? `A supporting document is required for ${lt.name} when leave exceeds ${docThreshold} day(s).`
                : `A supporting document is required for ${lt.name}.`;
            req.flash('error', msg);
            return res.redirect('/teacher/leave/apply');
        }

        // Check max consecutive days
        if (lt.maxConsecutiveDays > 0 && totalDays > lt.maxConsecutiveDays) {
            req.flash('error', `Maximum consecutive days for ${lt.name} is ${lt.maxConsecutiveDays}.`);
            return res.redirect('/teacher/leave/apply');
        }

        // Check overlapping leave
        const overlap = await LeaveApplication.findOne({
            teacher: req.session.userId,
            school: req.session.schoolId,
            status: { $in: ['pending', 'approved', 'modification_requested'] },
            $or: [
                { fromDate: { $lte: to }, toDate: { $gte: from } },
            ],
        });
        if (overlap) {
            req.flash('error', 'You already have a leave application overlapping these dates.');
            return res.redirect('/teacher/leave/apply');
        }

        const ay = await getActiveAY(req.session.schoolId);
        // Check balance
        let balance = await LeaveBalance.findOne({
            teacher: req.session.userId, school: req.session.schoolId,
            leaveType: leaveTypeId, academicYear: ay,
        });

        if (!balance) {
            // Auto-create a zero balance record so teacher can still apply (admin may allocate later)
            balance = await LeaveBalance.create({
                teacher: req.session.userId,
                school: req.session.schoolId,
                leaveType: leaveTypeId,
                academicYear: ay,
                totalAllocated: 0,
                carriedForward: 0,
                used: 0,
                pending: 0,
            });
        }

        const remaining = balance.totalAllocated + balance.carriedForward - balance.used - balance.pending;
        if (totalDays > remaining) {
            req.flash('error', `Insufficient leave balance. Available: ${remaining} day(s), Requested: ${totalDays} day(s).`);
            return res.redirect('/teacher/leave/apply');
        }

        // Create application
        const app = await LeaveApplication.create({
            teacher: req.session.userId,
            school: req.session.schoolId,
            leaveType: leaveTypeId,
            fromDate: from,
            toDate: to,
            totalDays,
            leaveMode: leaveMode || 'full_day',
            reason: reason.trim(),
            document: documentPath,
        });

        // Deduct from pending balance
        await LeaveBalance.findOneAndUpdate(
            { teacher: req.session.userId, school: req.session.schoolId, leaveType: leaveTypeId, academicYear: ay },
            { $inc: { pending: totalDays } }
        );

        await logAction(req.session.userId, req.session.schoolId, 'APPLY_LEAVE', app._id, null,
            { leaveType: lt.name, fromDate, toDate, totalDays });

        // Notify all school admins
        const admins = await User.find({ school: req.session.schoolId, role: 'school_admin', isActive: true }).select('_id');
        if (admins.length) {
            const teacherName = req.session.userName || 'A teacher';
            await notifyUsers(
                admins.map(a => a._id),
                'New Leave Application',
                `${teacherName} has applied for ${lt.name} from ${fmtDate(from)} to ${fmtDate(to)} (${totalDays} day(s)).`,
                req.session.userId, 'teacher', req.session.schoolId
            );
        }

        req.flash('success', 'Leave application submitted successfully.');
        res.redirect('/teacher/leave');
    } catch (err) {
        console.error(err);
        req.flash('error', err.message);
        res.redirect('/teacher/leave/apply');
    }
};

/* ─────────────────────────────────────────────────────────────
   TEACHER — CANCEL LEAVE
───────────────────────────────────────────────────────────── */

exports.teacherPostCancelLeave = async (req, res) => {
    try {
        const app = await LeaveApplication.findOne({
            _id: req.params.id,
            teacher: req.session.userId,
            school: req.session.schoolId,
        }).populate('leaveType', 'name');

        if (!app) { req.flash('error', 'Application not found.'); return res.redirect('/teacher/leave'); }
        if (!['pending', 'modification_requested'].includes(app.status)) {
            req.flash('error', 'Only pending applications can be cancelled.');
            return res.redirect('/teacher/leave');
        }

        const ay = await getActiveAY(req.session.schoolId);
        await LeaveBalance.findOneAndUpdate(
            { teacher: req.session.userId, school: req.session.schoolId, leaveType: app.leaveType._id, academicYear: ay },
            { $inc: { pending: -app.totalDays } }
        );

        app.status = 'cancelled';
        app.cancelledAt = new Date();
        await app.save();

        await logAction(req.session.userId, req.session.schoolId, 'CANCEL_LEAVE', app._id,
            { status: 'pending' }, { status: 'cancelled' });

        req.flash('success', 'Leave application cancelled.');
        res.redirect('/teacher/leave');
    } catch (err) {
        console.error(err);
        req.flash('error', err.message);
        res.redirect('/teacher/leave');
    }
};
