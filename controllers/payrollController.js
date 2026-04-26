const SalaryStructure         = require('../models/SalaryStructure');
const EmployeeSalaryAssignment = require('../models/EmployeeSalaryAssignment');
const PayrollRun               = require('../models/PayrollRun');
const PayrollEntry             = require('../models/PayrollEntry');
const Payslip                  = require('../models/Payslip');
const PayrollAuditLog          = require('../models/PayrollAuditLog');
const User                     = require('../models/User');
const TeacherProfile           = require('../models/TeacherProfile');
const Notification             = require('../models/Notification');
const NotificationReceipt      = require('../models/NotificationReceipt');
const sseClients               = require('../utils/sseClients');

const MONTH_NAMES = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

// ── Internal helpers ─────────────────────────────────────────────────────────

async function audit(school, user, role, actionType, entityType, entityId, oldValue, newValue) {
    try {
        await PayrollAuditLog.create({ school, user, role, actionType, entityType, entityId, oldValue, newValue });
    } catch (e) {
        console.error('Payroll audit log failed:', e.message);
    }
}

async function notify(schoolId, senderUserId, senderRole, title, body, recipientIds) {
    try {
        const ids = [...new Set(recipientIds.map(id => id ? id.toString() : null).filter(Boolean))];
        if (!ids.length) return;
        const notif = await Notification.create({
            title, body,
            sender: senderUserId,
            senderRole,
            school: schoolId,
            channels: { inApp: true, email: false },
            target: { type: 'individual', schools: [] },
            recipientCount: ids.length,
        });
        await NotificationReceipt.insertMany(
            ids.map(rid => ({ notification: notif._id, recipient: rid, school: schoolId })),
            { ordered: false }
        );
        sseClients.pushMany(ids, 'notification', { title, body, senderRole, createdAt: notif.createdAt });
    } catch (e) {
        console.error('[Payroll] Notification failed:', e.message);
    }
}

function calcComponents(structure, assignment) {
    const overrides = {};
    (assignment.componentOverrides || []).forEach(o => {
        overrides[o.componentName.toLowerCase()] = o.value;
    });

    const computed  = {};
    const earnings  = [];
    const deductions = [];
    const active = (structure.components || []).filter(c => c.isActive);

    // CTC is stored as ANNUAL. All payroll calculations use the MONTHLY figure (annual / 12).
    const annualCtc  = assignment.ctc || 0;
    const monthlyCTC = Math.round((annualCtc / 12) * 100) / 100;
    const ctcAliases = [
        'total salary', 'ctc', 'gross', 'total', 'cost to company',
        'package', 'monthly ctc', 'annual ctc', 'total ctc', 'monthly salary',
    ];
    ctcAliases.forEach(alias => { computed[alias] = monthlyCTC; });

    // Pass 1: fixed
    active.filter(c => c.calculationType === 'fixed').forEach(c => {
        const amt = overrides[c.name.toLowerCase()] !== undefined
            ? overrides[c.name.toLowerCase()]
            : (c.value || 0);
        computed[c.name.toLowerCase()] = amt;
        (c.type === 'earning' ? earnings : deductions).push({ name: c.name, amount: amt, order: c.order || 0 });
    });

    // Pass 2: percentage (may reference already-computed percentage components via multi-pass)
    const pctComponents = active.filter(c => c.calculationType === 'percentage');
    let changed = true;
    let passes = 0;
    while (changed && passes < 10) {
        changed = false;
        pctComponents.forEach(c => {
            if (computed[c.name.toLowerCase()] !== undefined) return;
            const baseKey = (c.percentageOf || 'basic salary').toLowerCase();
            let base = computed[baseKey];
            if (base === undefined) {
                const k = Object.keys(computed).find(k => k.includes(baseKey) || baseKey.includes(k));
                base = k !== undefined ? computed[k] : undefined;
            }
            if (base === undefined) return;
            const override = overrides[c.name.toLowerCase()];
            const amt = override !== undefined ? override : Math.round(((c.percentage || 0) / 100) * base * 100) / 100;
            computed[c.name.toLowerCase()] = amt;
            (c.type === 'earning' ? earnings : deductions).push({ name: c.name, amount: amt, order: c.order || 0 });
            changed = true;
        });
        passes++;
    }

    // Unresolved percentage components default to 0
    pctComponents.forEach(c => {
        if (computed[c.name.toLowerCase()] !== undefined) return;
        const amt = overrides[c.name.toLowerCase()] !== undefined ? overrides[c.name.toLowerCase()] : 0;
        computed[c.name.toLowerCase()] = amt;
        (c.type === 'earning' ? earnings : deductions).push({ name: c.name, amount: amt, order: c.order || 0 });
    });

    earnings.sort((a, b) => a.order - b.order);
    deductions.sort((a, b) => a.order - b.order);

    const grossSalary    = earnings.reduce((s, e) => s + e.amount, 0);
    const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);
    const netSalary       = Math.round((grossSalary - totalDeductions) * 100) / 100;

    return {
        earnings:        earnings.map(({ name, amount }) => ({ name, amount })),
        deductions:      deductions.map(({ name, amount }) => ({ name, amount })),
        grossSalary:     Math.round(grossSalary * 100) / 100,
        totalDeductions: Math.round(totalDeductions * 100) / 100,
        netSalary,
    };
}

// ── Dashboard ────────────────────────────────────────────────────────────────

exports.getDashboard = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const now = new Date();
        const thisMonth = now.getMonth() + 1;
        const thisYear  = now.getFullYear();

        const [
            totalStructures,
            totalAssignments,
            totalRuns,
            lastRun,
            thisMonthRun,
            recentRuns,
        ] = await Promise.all([
            SalaryStructure.countDocuments({ school: schoolId, isActive: true }),
            EmployeeSalaryAssignment.countDocuments({ school: schoolId, isActive: true }),
            PayrollRun.countDocuments({ school: schoolId }),
            PayrollRun.findOne({ school: schoolId }).sort({ year: -1, month: -1 }),
            PayrollRun.findOne({ school: schoolId, month: thisMonth, year: thisYear }),
            PayrollRun.find({ school: schoolId }).sort({ year: -1, month: -1 }).limit(6)
                .populate('processedBy', 'name'),
        ]);

        res.render('payroll/admin/dashboard', {
            title: 'Payroll Dashboard',
            layout: 'layouts/main',
            stats: { totalStructures, totalAssignments, totalRuns },
            lastRun,
            thisMonthRun,
            recentRuns,
            thisMonth,
            thisYear,
            MONTH_NAMES,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load payroll dashboard.');
        res.redirect('/admin/dashboard');
    }
};

// ── Salary Structures ────────────────────────────────────────────────────────

exports.getStructures = async (req, res) => {
    try {
        const structures = await SalaryStructure.find({ school: req.session.schoolId })
            .sort({ isActive: -1, name: 1 });
        res.render('payroll/admin/structures/index', {
            title: 'Salary Structures',
            layout: 'layouts/main',
            structures,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load salary structures.');
        res.redirect('/payroll/admin/dashboard');
    }
};

exports.getCreateStructure = (req, res) => {
    res.render('payroll/admin/structures/form', {
        title: 'Create Salary Structure',
        layout: 'layouts/main',
        structure: null,
    });
};

exports.postCreateStructure = async (req, res) => {
    try {
        const { name, description, components } = req.body;
        const schoolId = req.session.schoolId;

        const parsed = parseComponents(components);

        const structure = await SalaryStructure.create({
            name: name.trim(),
            school: schoolId,
            description: description ? description.trim() : '',
            components: parsed,
            createdBy: req.session.userId,
        });

        await audit(schoolId, req.session.userId, req.session.userRole,
            'STRUCTURE_CREATED', 'SalaryStructure', structure._id, null, { name });

        req.flash('success', `Salary structure "${structure.name}" created successfully.`);
        res.redirect('/payroll/admin/structures');
    } catch (err) {
        console.error(err);
        const msg = err.code === 11000 ? 'A structure with this name already exists.' : 'Failed to create salary structure.';
        req.flash('error', msg);
        res.redirect('/payroll/admin/structures/create');
    }
};

exports.getEditStructure = async (req, res) => {
    try {
        const structure = await SalaryStructure.findOne({ _id: req.params.id, school: req.session.schoolId });
        if (!structure) { req.flash('error', 'Structure not found.'); return res.redirect('/payroll/admin/structures'); }
        res.render('payroll/admin/structures/form', {
            title: 'Edit Salary Structure',
            layout: 'layouts/main',
            structure,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load structure.');
        res.redirect('/payroll/admin/structures');
    }
};

exports.postEditStructure = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const structure = await SalaryStructure.findOne({ _id: req.params.id, school: schoolId });
        if (!structure) { req.flash('error', 'Structure not found.'); return res.redirect('/payroll/admin/structures'); }

        const old = { name: structure.name, description: structure.description };
        const { name, description, components } = req.body;

        structure.name        = name.trim();
        structure.description = description ? description.trim() : '';
        structure.components  = parseComponents(components);
        await structure.save();

        await audit(schoolId, req.session.userId, req.session.userRole,
            'STRUCTURE_UPDATED', 'SalaryStructure', structure._id, old, { name: structure.name });

        req.flash('success', 'Salary structure updated successfully.');
        res.redirect('/payroll/admin/structures');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to update salary structure.');
        res.redirect(`/payroll/admin/structures/${req.params.id}/edit`);
    }
};

exports.postToggleStructure = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const structure = await SalaryStructure.findOne({ _id: req.params.id, school: schoolId });
        if (!structure) { req.flash('error', 'Structure not found.'); return res.redirect('/payroll/admin/structures'); }
        structure.isActive = !structure.isActive;
        await structure.save();
        req.flash('success', `Structure "${structure.name}" ${structure.isActive ? 'activated' : 'deactivated'}.`);
        res.redirect('/payroll/admin/structures');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to toggle structure status.');
        res.redirect('/payroll/admin/structures');
    }
};

// ── Salary Assignments ───────────────────────────────────────────────────────

exports.getAssignments = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const assignments = await EmployeeSalaryAssignment.find({ school: schoolId })
            .populate('employee', 'name email')
            .populate('structure', 'name')
            .sort({ isActive: -1, createdAt: -1 });

        res.render('payroll/admin/assignments/index', {
            title: 'Salary Assignments',
            layout: 'layouts/main',
            assignments,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load salary assignments.');
        res.redirect('/payroll/admin/dashboard');
    }
};

exports.getAssignEmployee = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const [teachers, structures] = await Promise.all([
            User.find({ school: schoolId, role: 'teacher', isActive: true }).sort({ name: 1 }).select('name email'),
            SalaryStructure.find({ school: schoolId, isActive: true }).sort({ name: 1 }),
        ]);
        res.render('payroll/admin/assignments/form', {
            title: 'Assign Salary',
            layout: 'layouts/main',
            assignment: null,
            teachers,
            structures,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load assignment form.');
        res.redirect('/payroll/admin/assignments');
    }
};

exports.postAssignEmployee = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const { employee, structure, effectiveDate, notes, overrides, ctc } = req.body;

        const parsed  = parseOverrides(overrides);
        const ctcVal  = parseFloat(ctc) || 0;

        const existing = await EmployeeSalaryAssignment.findOne({ school: schoolId, employee, isActive: true });
        if (existing) {
            existing.revisionHistory.push({
                structure: existing.structure,
                effectiveDate: existing.effectiveDate,
                changedBy: req.session.userId,
                notes: 'Superseded by new assignment',
            });
            existing.isActive = false;
            await existing.save();
        }

        const effDate = new Date(effectiveDate);
        const assignment = await EmployeeSalaryAssignment.create({
            employee,
            school: schoolId,
            structure,
            effectiveDate: effDate,
            ctc: ctcVal,
            componentOverrides: parsed,
            assignedBy: req.session.userId,
            notes: notes ? notes.trim() : '',
            ctcRevisions: ctcVal > 0 ? [{
                annualCtc:      ctcVal,
                previousCtc:    0,
                incrementType:  'initial',
                incrementValue: 0,
                effectiveMonth: effDate.getMonth() + 1,
                effectiveYear:  effDate.getFullYear(),
                note:           'Initial salary assignment',
                updatedBy:      req.session.userId,
                updatedAt:      new Date(),
            }] : [],
        });

        await audit(schoolId, req.session.userId, req.session.userRole,
            'ASSIGNMENT_CREATED', 'EmployeeSalaryAssignment', assignment._id, null, { employee, structure });

        req.flash('success', 'Salary assigned successfully.');
        res.redirect('/payroll/admin/assignments');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to assign salary.');
        res.redirect('/payroll/admin/assignments/assign');
    }
};

exports.getEditAssignment = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const [assignment, teachers, structures] = await Promise.all([
            EmployeeSalaryAssignment.findOne({ _id: req.params.id, school: schoolId })
                .populate('employee', 'name email')
                .populate('structure'),
            User.find({ school: schoolId, role: 'teacher', isActive: true }).sort({ name: 1 }).select('name email'),
            SalaryStructure.find({ school: schoolId, isActive: true }).sort({ name: 1 }),
        ]);
        if (!assignment) { req.flash('error', 'Assignment not found.'); return res.redirect('/payroll/admin/assignments'); }

        res.render('payroll/admin/assignments/form', {
            title: 'Edit Salary Assignment',
            layout: 'layouts/main',
            assignment,
            teachers,
            structures,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load assignment.');
        res.redirect('/payroll/admin/assignments');
    }
};

exports.postEditAssignment = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const assignment = await EmployeeSalaryAssignment.findOne({ _id: req.params.id, school: schoolId });
        if (!assignment) { req.flash('error', 'Assignment not found.'); return res.redirect('/payroll/admin/assignments'); }

        const old = { structure: assignment.structure, effectiveDate: assignment.effectiveDate };
        assignment.revisionHistory.push({
            structure: assignment.structure,
            effectiveDate: assignment.effectiveDate,
            changedBy: req.session.userId,
            notes: req.body.notes || '',
        });

        assignment.structure          = req.body.structure;
        assignment.effectiveDate      = new Date(req.body.effectiveDate);
        assignment.ctc                = parseFloat(req.body.ctc) || 0;
        assignment.componentOverrides = parseOverrides(req.body.overrides);
        assignment.notes              = req.body.notes ? req.body.notes.trim() : '';
        await assignment.save();

        await audit(schoolId, req.session.userId, req.session.userRole,
            'ASSIGNMENT_UPDATED', 'EmployeeSalaryAssignment', assignment._id, old, { structure: assignment.structure });

        req.flash('success', 'Salary assignment updated.');
        res.redirect('/payroll/admin/assignments');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to update assignment.');
        res.redirect(`/payroll/admin/assignments/${req.params.id}/edit`);
    }
};

exports.postDeactivateAssignment = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const assignment = await EmployeeSalaryAssignment.findOne({ _id: req.params.id, school: schoolId });
        if (!assignment) { req.flash('error', 'Assignment not found.'); return res.redirect('/payroll/admin/assignments'); }
        assignment.isActive = false;
        await assignment.save();
        await audit(schoolId, req.session.userId, req.session.userRole,
            'ASSIGNMENT_DEACTIVATED', 'EmployeeSalaryAssignment', assignment._id, null, null);
        req.flash('success', 'Assignment deactivated.');
        res.redirect('/payroll/admin/assignments');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to deactivate assignment.');
        res.redirect('/payroll/admin/assignments');
    }
};

/// AJAX: return structure components for preview
exports.apiGetStructureComponents = async (req, res) => {
    try {
        const structure = await SalaryStructure.findOne({ _id: req.params.id, school: req.session.schoolId });
        if (!structure) return res.json({ ok: false });
        res.json({ ok: true, components: structure.components });
    } catch (err) {
        res.json({ ok: false });
    }
};

// ── CTC Management ───────────────────────────────────────────────────────────

exports.getUpdateCtc = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const assignment = await EmployeeSalaryAssignment.findOne({ _id: req.params.id, school: schoolId })
            .populate('employee', 'name email');
        if (!assignment) { req.flash('error', 'Assignment not found.'); return res.redirect('/payroll/admin/assignments'); }
        const now = new Date();
        res.render('payroll/admin/assignments/update-ctc', {
            title: `Update CTC — ${assignment.employee.name}`,
            layout: 'layouts/main',
            assignment,
            defaultMonth: now.getMonth() + 1,
            defaultYear:  now.getFullYear(),
            MONTH_NAMES,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load CTC update form.');
        res.redirect('/payroll/admin/assignments');
    }
};

exports.postUpdateCtc = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const assignment = await EmployeeSalaryAssignment.findOne({ _id: req.params.id, school: schoolId })
            .populate('employee', 'name email');
        if (!assignment) { req.flash('error', 'Assignment not found.'); return res.redirect('/payroll/admin/assignments'); }

        const { incrementType, incrementValue, newCtc, effectiveMonth, effectiveYear, note } = req.body;
        const prevCtc       = assignment.ctc || 0;
        const effectiveM    = parseInt(effectiveMonth, 10);
        const effectiveY    = parseInt(effectiveYear,  10);
        const incVal        = parseFloat(incrementValue) || 0;

        let resolvedCtc;
        if (incrementType === 'increment_pct') {
            resolvedCtc = Math.round(prevCtc * (1 + incVal / 100) * 100) / 100;
        } else if (incrementType === 'increment_value') {
            resolvedCtc = Math.round((prevCtc + incVal) * 100) / 100;
        } else {
            resolvedCtc = parseFloat(newCtc) || 0;
        }

        if (resolvedCtc <= 0) {
            req.flash('error', 'New CTC must be greater than 0.');
            return res.redirect(`/payroll/admin/assignments/${req.params.id}/update-ctc`);
        }

        // Check for duplicate effective period
        const dupRevision = assignment.ctcRevisions.find(
            r => r.effectiveMonth === effectiveM && r.effectiveYear === effectiveY
        );
        if (dupRevision) {
            // Update in-place
            dupRevision.annualCtc      = resolvedCtc;
            dupRevision.previousCtc    = prevCtc;
            dupRevision.incrementType  = incrementType;
            dupRevision.incrementValue = incVal;
            dupRevision.note           = note || '';
            dupRevision.updatedBy      = req.session.userId;
            dupRevision.updatedAt      = new Date();
        } else {
            assignment.ctcRevisions.push({
                annualCtc:      resolvedCtc,
                previousCtc:    prevCtc,
                incrementType,
                incrementValue: incVal,
                effectiveMonth: effectiveM,
                effectiveYear:  effectiveY,
                note:           note || '',
                updatedBy:      req.session.userId,
            });
        }

        // Set ctc to the latest (most recent effective) revision
        const sorted = [...assignment.ctcRevisions].sort((a, b) =>
            b.effectiveYear !== a.effectiveYear
                ? b.effectiveYear - a.effectiveYear
                : b.effectiveMonth - a.effectiveMonth
        );
        assignment.ctc = sorted[0].annualCtc;
        await assignment.save();

        await audit(schoolId, req.session.userId, req.session.userRole,
            'CTC_UPDATED', 'EmployeeSalaryAssignment', assignment._id,
            { ctc: prevCtc },
            { ctc: resolvedCtc, effectiveMonth: effectiveM, effectiveYear: effectiveY, incrementType }
        );

        // Notify employee if this is an increment (not the first-time set)
        const isIncrement = incrementType !== 'initial' && prevCtc > 0;
        if (isIncrement) {
            const pctChange = prevCtc > 0
                ? ((resolvedCtc - prevCtc) / prevCtc * 100).toFixed(1)
                : '—';
            await notify(
                schoolId, req.session.userId, req.session.userRole,
                'Salary Revised 🎉',
                `Your Annual CTC has been updated to ₹${resolvedCtc.toLocaleString('en-IN')} ` +
                `effective from ${MONTH_NAMES[effectiveM]} ${effectiveY} ` +
                `(${pctChange}% revision from ₹${prevCtc.toLocaleString('en-IN')}).`,
                [assignment.employee._id.toString()]
            );
        }

        req.flash('success', `CTC updated to ₹${resolvedCtc.toLocaleString('en-IN')} effective ${MONTH_NAMES[effectiveM]} ${effectiveY}.`);
        res.redirect(`/payroll/admin/assignments/${assignment._id}/ctc-history`);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to update CTC.');
        res.redirect(`/payroll/admin/assignments/${req.params.id}/update-ctc`);
    }
};

exports.getCtcHistory = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const assignment = await EmployeeSalaryAssignment.findOne({ _id: req.params.id, school: schoolId })
            .populate('employee', 'name email')
            .populate('ctcRevisions.updatedBy', 'name');
        if (!assignment) { req.flash('error', 'Assignment not found.'); return res.redirect('/payroll/admin/assignments'); }
        const revisions = [...(assignment.ctcRevisions || [])].sort((a, b) =>
            b.effectiveYear !== a.effectiveYear
                ? b.effectiveYear - a.effectiveYear
                : b.effectiveMonth - a.effectiveMonth
        );
        res.render('payroll/admin/assignments/ctc-history', {
            title: `CTC History — ${assignment.employee.name}`,
            layout: 'layouts/main',
            assignment,
            revisions,
            MONTH_NAMES,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load CTC history.');
        res.redirect('/payroll/admin/assignments');
    }
};

// Teacher: view own CTC & timeline
exports.getMyCtc = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const assignment = await EmployeeSalaryAssignment.findOne({
            school: schoolId, employee: req.session.userId, isActive: true,
        })
            .populate('structure', 'name')
            .populate('ctcRevisions.updatedBy', 'name');
        if (!assignment) {
            return res.render('payroll/teacher/ctc', {
                title: 'My CTC',
                layout: 'layouts/main',
                assignment: null,
                revisions: [],
                MONTH_NAMES,
            });
        }
        const revisions = [...(assignment.ctcRevisions || [])].sort((a, b) =>
            b.effectiveYear !== a.effectiveYear
                ? b.effectiveYear - a.effectiveYear
                : b.effectiveMonth - a.effectiveMonth
        );
        res.render('payroll/teacher/ctc', {
            title: 'My CTC',
            layout: 'layouts/main',
            assignment,
            revisions,
            MONTH_NAMES,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load CTC details.');
        res.redirect('/teacher/dashboard');
    }
};

// ── Payroll Runs ─────────────────────────────────────────────────────────────

exports.getPayrollRuns = async (req, res) => {
    try {
        const runs = await PayrollRun.find({ school: req.session.schoolId })
            .populate('processedBy', 'name')
            .populate('approvedBy', 'name')
            .sort({ year: -1, month: -1 });
        res.render('payroll/admin/runs/index', {
            title: 'Payroll Runs',
            layout: 'layouts/main',
            runs,
            MONTH_NAMES,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load payroll runs.');
        res.redirect('/payroll/admin/dashboard');
    }
};

exports.getCreateRun = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const now = new Date();
        const assignmentCount = await EmployeeSalaryAssignment.countDocuments({ school: schoolId, isActive: true });
        res.render('payroll/admin/runs/create', {
            title: 'Run Payroll',
            layout: 'layouts/main',
            defaultMonth: now.getMonth() + 1,
            defaultYear: now.getFullYear(),
            assignmentCount,
            MONTH_NAMES,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load payroll form.');
        res.redirect('/payroll/admin/runs');
    }
};

exports.postCreateRun = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const month = parseInt(req.body.month, 10);
        const year  = parseInt(req.body.year,  10);

        if (!month || !year || month < 1 || month > 12) {
            req.flash('error', 'Invalid month or year.');
            return res.redirect('/payroll/admin/runs/create');
        }

        const existing = await PayrollRun.findOne({ school: schoolId, month, year });
        if (existing) {
            req.flash('error', `Payroll for ${MONTH_NAMES[month]} ${year} already exists.`);
            return res.redirect('/payroll/admin/runs');
        }

        // Step 1 — calculate entries first (no DB writes yet)
        const assignments = await EmployeeSalaryAssignment.find({ school: schoolId, isActive: true })
            .populate('structure');

        let totalGross = 0, totalDed = 0, totalNet = 0;
        const entryDocs = [];

        for (const asgn of assignments) {
            if (!asgn.structure) continue;
            // Pass a plain object so Mongoose getters don't shadow the activeCTC we inject
            const activeCTC = asgn.getActiveCTC(year, month);
            const calc = calcComponents(asgn.structure, {
                ctc: activeCTC,
                componentOverrides: asgn.componentOverrides,
            });
            totalGross += calc.grossSalary;
            totalDed   += calc.totalDeductions;
            totalNet   += calc.netSalary;
            entryDocs.push({
                employee:         asgn.employee,
                school:           schoolId,
                month,
                year,
                salaryAssignment: asgn._id,
                earnings:         calc.earnings,
                deductions:       calc.deductions,
                grossSalary:      calc.grossSalary,
                totalDeductions:  calc.totalDeductions,
                netSalary:        calc.netSalary,
            });
        }

        // Step 2 — create run only after calculations succeed
        const run = await PayrollRun.create({
            school:          schoolId,
            month,
            year,
            processedBy:     req.session.userId,
            processedAt:     new Date(),
            notes:           req.body.notes || '',
            totalEmployees:  entryDocs.length,
            totalGross:      Math.round(totalGross * 100) / 100,
            totalDeductions: Math.round(totalDed   * 100) / 100,
            totalNet:        Math.round(totalNet   * 100) / 100,
        });

        // Step 3 — insert entries linked to the run
        if (entryDocs.length > 0) {
            entryDocs.forEach(e => { e.payrollRun = run._id; });
            await PayrollEntry.insertMany(entryDocs);
        }

        await audit(schoolId, req.session.userId, req.session.userRole,
            'PAYROLL_RUN', 'PayrollRun', run._id, null, { month, year, totalEmployees: run.totalEmployees });

        req.flash('success', `Payroll for ${MONTH_NAMES[month]} ${year} created with ${entryDocs.length} entries.`);
        res.redirect(`/payroll/admin/runs/${run._id}`);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to process payroll.');
        res.redirect('/payroll/admin/runs/create');
    }
};

exports.getRunDetail = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const run = await PayrollRun.findOne({ _id: req.params.id, school: schoolId })
            .populate('processedBy', 'name')
            .populate('reviewedBy', 'name')
            .populate('approvedBy', 'name')
            .populate('publishedBy', 'name');
        if (!run) { req.flash('error', 'Payroll run not found.'); return res.redirect('/payroll/admin/runs'); }

        const entries = await PayrollEntry.find({ payrollRun: run._id })
            .populate('employee', 'name email')
            .populate('salaryAssignment')
            .sort({ 'employee.name': 1 });

        res.render('payroll/admin/runs/view', {
            title: `Payroll — ${MONTH_NAMES[run.month]} ${run.year}`,
            layout: 'layouts/main',
            run,
            entries,
            MONTH_NAMES,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load payroll run.');
        res.redirect('/payroll/admin/runs');
    }
};

exports.postUpdateRunStatus = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const run = await PayrollRun.findOne({ _id: req.params.id, school: schoolId });
        if (!run) { req.flash('error', 'Run not found.'); return res.redirect('/payroll/admin/runs'); }

        const { action } = req.body;
        const transitions = { draft: 'reviewed', reviewed: 'approved' };

        if (run.status === 'published') {
            req.flash('error', 'Published payroll cannot be changed.'); return res.redirect(`/payroll/admin/runs/${run._id}`);
        }

        if (action === 'review' && run.status === 'draft') {
            run.status     = 'reviewed';
            run.reviewedBy = req.session.userId;
            run.reviewedAt = new Date();
            await audit(schoolId, req.session.userId, req.session.userRole,
                'PAYROLL_REVIEWED', 'PayrollRun', run._id, { status: 'draft' }, { status: 'reviewed' });
        } else if (action === 'approve' && run.status === 'reviewed') {
            run.status     = 'approved';
            run.approvedBy = req.session.userId;
            run.approvedAt = new Date();
            await audit(schoolId, req.session.userId, req.session.userRole,
                'PAYROLL_APPROVED', 'PayrollRun', run._id, { status: 'reviewed' }, { status: 'approved' });
        } else {
            req.flash('error', 'Invalid status transition.');
            return res.redirect(`/payroll/admin/runs/${run._id}`);
        }
        await run.save();
        req.flash('success', `Payroll moved to ${run.status}.`);
        res.redirect(`/payroll/admin/runs/${run._id}`);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to update status.');
        res.redirect(`/payroll/admin/runs/${req.params.id}`);
    }
};

exports.postPublishRun = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const run = await PayrollRun.findOne({ _id: req.params.id, school: schoolId });
        if (!run) { req.flash('error', 'Run not found.'); return res.redirect('/payroll/admin/runs'); }
        if (run.status !== 'approved') {
            req.flash('error', 'Only approved payroll can be published.'); return res.redirect(`/payroll/admin/runs/${run._id}`);
        }

        const schoolDoc = (await User.findById(req.session.userId).populate('school'))?.school;
        const entries   = await PayrollEntry.find({ payrollRun: run._id })
            .populate('employee', 'name email')
            .populate('salaryAssignment');

        const payslipIds  = [];
        const empUserIds  = [];
        const payslipDocs = [];

        for (const entry of entries) {
            const profile = await TeacherProfile.findOne({ school: schoolId, user: entry.employee._id })
                .select('employeeId designation department joiningDate');

            const payslip = await Payslip.create({
                payrollEntry: entry._id,
                employee:     entry.employee._id,
                school:       schoolId,
                month:        run.month,
                year:         run.year,
                employeeSnapshot: {
                    name:        entry.employee.name,
                    email:       entry.employee.email,
                    employeeId:  profile?.employeeId  || '',
                    designation: profile?.designation || '',
                    department:  profile?.department  || '',
                    joiningDate: profile?.joiningDate || null,
                },
                schoolSnapshot: {
                    name:    schoolDoc?.name    || '',
                    address: schoolDoc?.address || '',
                    email:   schoolDoc?.email   || '',
                    phone:   schoolDoc?.phone   || '',
                },
                earnings:        entry.earnings,
                deductions:      entry.deductions,
                grossSalary:     entry.grossSalary,
                totalDeductions: Math.round((entry.totalDeductions + entry.lopAmount) * 100) / 100,
                netSalary:       entry.netSalary,
                lopDays:         entry.lopDays,
                lopAmount:       entry.lopAmount,
                arrears:         entry.arrears,
                bonus:           entry.bonus,
                generatedBy:     req.session.userId,
                isLocked:        true,
            });

            entry.payslip = payslip._id;
            await entry.save();

            payslipDocs.push(payslip);
            empUserIds.push(entry.employee._id.toString());

            await audit(schoolId, req.session.userId, req.session.userRole,
                'PAYSLIP_GENERATED', 'Payslip', payslip._id, null,
                { employee: entry.employee._id, month: run.month, year: run.year });
        }

        run.status      = 'published';
        run.publishedBy = req.session.userId;
        run.publishedAt = new Date();
        await run.save();

        await audit(schoolId, req.session.userId, req.session.userRole,
            'PAYROLL_PUBLISHED', 'PayrollRun', run._id, { status: 'approved' }, { status: 'published' });

        // Notify all employees
        if (empUserIds.length > 0) {
            await notify(
                schoolId, req.session.userId, req.session.userRole,
                'Salary Slip Available',
                `Your salary slip for ${MONTH_NAMES[run.month]} ${run.year} has been released. Please log in to view and download it.`,
                empUserIds
            );
        }

        req.flash('success', `Payroll published. ${payslipDocs.length} payslips generated and employees notified.`);
        res.redirect(`/payroll/admin/runs/${run._id}`);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to publish payroll.');
        res.redirect(`/payroll/admin/runs/${req.params.id}`);
    }
};

exports.postUpdateEntry = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const entry = await PayrollEntry.findOne({ _id: req.params.entryId, school: schoolId });
        if (!entry) return res.json({ ok: false, message: 'Entry not found.' });

        const run = await PayrollRun.findById(entry.payrollRun);
        if (!run || run.status === 'published') {
            return res.json({ ok: false, message: 'Cannot edit published payroll.' });
        }

        const lopDays   = parseFloat(req.body.lopDays)  || 0;
        const lopAmount = parseFloat(req.body.lopAmount) || 0;
        const arrears   = parseFloat(req.body.arrears)   || 0;
        const bonus     = parseFloat(req.body.bonus)     || 0;

        const old = { lopDays: entry.lopDays, lopAmount: entry.lopAmount, arrears: entry.arrears, bonus: entry.bonus };

        entry.lopDays   = lopDays;
        entry.lopAmount = lopAmount;
        entry.arrears   = arrears;
        entry.bonus     = bonus;
        entry.netSalary = Math.round((entry.grossSalary - entry.totalDeductions - lopAmount + arrears + bonus) * 100) / 100;
        await entry.save();

        // Recalculate run totals
        const allEntries = await PayrollEntry.find({ payrollRun: run._id });
        run.totalGross      = Math.round(allEntries.reduce((s, e) => s + e.grossSalary, 0) * 100) / 100;
        run.totalDeductions = Math.round(allEntries.reduce((s, e) => s + e.totalDeductions + e.lopAmount, 0) * 100) / 100;
        run.totalNet        = Math.round(allEntries.reduce((s, e) => s + e.netSalary, 0) * 100) / 100;
        await run.save();

        await audit(schoolId, req.session.userId, req.session.userRole,
            'ENTRY_UPDATED', 'PayrollEntry', entry._id, old, { lopDays, lopAmount, arrears, bonus });

        res.json({ ok: true, netSalary: entry.netSalary });
    } catch (err) {
        console.error(err);
        res.json({ ok: false, message: 'Failed to update entry.' });
    }
};

// ── Reports ──────────────────────────────────────────────────────────────────

exports.getReports = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const year = parseInt(req.query.year, 10) || new Date().getFullYear();

        const runs = await PayrollRun.find({ school: schoolId, year, status: 'published' })
            .sort({ month: 1 });

        // Department-wise report from latest published run
        const lastPublished = await PayrollRun.findOne({ school: schoolId, status: 'published' })
            .sort({ year: -1, month: -1 });

        let deptReport = [];
        if (lastPublished) {
            const entries = await PayrollEntry.find({ payrollRun: lastPublished._id })
                .populate('employee', 'name');
            const profiles = await TeacherProfile.find({
                school: schoolId,
                user: { $in: entries.map(e => e.employee._id) },
            }).select('user department');
            const deptMap = {};
            profiles.forEach(p => { deptMap[p.user.toString()] = p.department || 'Unassigned'; });
            const deptAgg = {};
            entries.forEach(e => {
                const dept = deptMap[e.employee._id.toString()] || 'Unassigned';
                if (!deptAgg[dept]) deptAgg[dept] = { dept, employees: 0, totalNet: 0 };
                deptAgg[dept].employees++;
                deptAgg[dept].totalNet += e.netSalary;
            });
            deptReport = Object.values(deptAgg).sort((a, b) => b.totalNet - a.totalNet);
        }

        const years = await PayrollRun.distinct('year', { school: schoolId }).then(yrs => yrs.sort((a, b) => b - a));

        res.render('payroll/admin/reports/index', {
            title: 'Payroll Reports',
            layout: 'layouts/main',
            runs,
            deptReport,
            year,
            years,
            lastPublished,
            MONTH_NAMES,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load reports.');
        res.redirect('/payroll/admin/dashboard');
    }
};

// ── Audit Log ────────────────────────────────────────────────────────────────

exports.getAuditLog = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const page  = parseInt(req.query.page, 10) || 1;
        const limit = 50;
        const skip  = (page - 1) * limit;

        const [logs, total] = await Promise.all([
            PayrollAuditLog.find({ school: schoolId })
                .populate('user', 'name role')
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(limit),
            PayrollAuditLog.countDocuments({ school: schoolId }),
        ]);

        res.render('payroll/admin/audit', {
            title: 'Payroll Audit Log',
            layout: 'layouts/main',
            logs,
            page,
            totalPages: Math.ceil(total / limit),
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load audit log.');
        res.redirect('/payroll/admin/dashboard');
    }
};

// ── Private parse helpers ────────────────────────────────────────────────────

function parseComponents(raw) {
    if (!raw) return [];
    const names = toArray(raw.name);
    const types  = toArray(raw.type);
    const calcs  = toArray(raw.calculationType);
    const vals   = toArray(raw.value);
    const pcts   = toArray(raw.percentage);
    const pctOfs = toArray(raw.percentageOf);
    const orders = toArray(raw.order);

    return names
        .map((name, i) => ({
            name:            (name || '').trim(),
            type:            types[i]  || 'earning',
            calculationType: calcs[i]  || 'fixed',
            value:           parseFloat(vals[i])   || 0,
            percentage:      parseFloat(pcts[i])   || 0,
            percentageOf:    (pctOfs[i] || 'Basic Salary').trim(),
            order:           parseInt(orders[i], 10) || i,
            isActive:        true,
        }))
        .filter(c => c.name);
}

function parseOverrides(raw) {
    if (!raw) return [];
    const names  = toArray(raw.name);
    const values = toArray(raw.value);
    return names
        .map((name, i) => ({ componentName: (name || '').trim(), value: parseFloat(values[i]) || 0 }))
        .filter(o => o.componentName);
}

function toArray(v) {
    if (!v) return [];
    return Array.isArray(v) ? v : [v];
}
