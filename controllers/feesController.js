const mongoose  = require('mongoose');
const FeeHead              = require('../models/FeeHead');
const FeeStructure         = require('../models/FeeStructure');
const StudentFeeAssignment = require('../models/StudentFeeAssignment');
const FineRule             = require('../models/FineRule');
const FeeConcession        = require('../models/FeeConcession');
const StudentConcession    = require('../models/StudentConcession');
const FeePayment           = require('../models/FeePayment');
const FeeLedger            = require('../models/FeeLedger');
const FeeSettings          = require('../models/FeeSettings');
const FeeAuditLog          = require('../models/FeeAuditLog');
const AcademicYear         = require('../models/AcademicYear');
const Class                = require('../models/Class');
const ClassSection         = require('../models/ClassSection');
const StudentProfile       = require('../models/StudentProfile');
const User                 = require('../models/User');
const { generateReceiptPDF } = require('../utils/feeReceiptPdf');

// ── Internal helpers ─────────────────────────────────────────────────────────

async function audit(school, user, role, actionType, entityType, entityId, oldValue, newValue) {
    try {
        await FeeAuditLog.create({ school, user, role, actionType, entityType, entityId, oldValue, newValue });
    } catch (e) {
        console.error('[Fees] Audit log failed:', e.message);
    }
}

async function getActiveAcademicYear(schoolId) {
    return AcademicYear.findOne({ school: schoolId, status: 'active' });
}

async function getOrCreateSettings(schoolId) {
    let settings = await FeeSettings.findOne({ school: schoolId });
    if (!settings) settings = await FeeSettings.create({ school: schoolId });
    return settings;
}

async function generateReceiptNumber(schoolId) {
    const settings = await FeeSettings.findOneAndUpdate(
        { school: schoolId },
        { $inc: { lastReceiptNumber: 1 } },
        { new: true, upsert: true }
    );
    const year = new Date().getFullYear();
    const num  = String(settings.lastReceiptNumber).padStart(6, '0');
    return `${settings.receiptPrefix || 'REC'}-${year}-${num}`;
}

// Fee resolution chain: Student → Section → Class
async function resolveFeeItems(studentId, academicYearId, schoolId) {
    // Priority 1: explicit student assignment
    const sfa = await StudentFeeAssignment.findOne({
        school: schoolId, student: studentId, academicYear: academicYearId, isActive: true,
    }).populate({ path: 'feeStructure', populate: { path: 'items.feeHead' } })
      .populate('customItems.feeHead');

    if (sfa) {
        if (sfa.useCustom) {
            return { level: 'student_custom', items: sfa.customItems.map(i => ({
                feeHeadId: i.feeHead?._id, feeName: i.feeName || i.feeHead?.name || '',
                category: i.feeHead?.category || 'custom', amount: i.amount,
                dueDate: i.dueDate, installmentLabel: i.installmentLabel,
            })), sourceId: sfa._id, sourceType: 'StudentFeeAssignment' };
        }
        if (sfa.feeStructure) {
            return _itemsFromStructure(sfa.feeStructure, 'student_structure', sfa._id, 'StudentFeeAssignment');
        }
    }

    // Priority 2: section-level structure
    const sp = await StudentProfile.findOne({ user: studentId, school: schoolId })
        .populate({ path: 'currentSection', populate: { path: 'class' } });

    if (sp && sp.currentSection) {
        const sectionStruct = await FeeStructure.findOne({
            school: schoolId, academicYear: academicYearId,
            level: 'section', section: sp.currentSection._id, isActive: true,
        }).populate('items.feeHead');
        if (sectionStruct) return _itemsFromStructure(sectionStruct, 'section', sectionStruct._id, 'FeeStructure');

        // Priority 3: class-level structure
        const classId = sp.currentSection.class?._id || sp.currentSection.class;
        if (classId) {
            const classStruct = await FeeStructure.findOne({
                school: schoolId, academicYear: academicYearId,
                level: 'class', class: classId, isActive: true,
            }).populate('items.feeHead');
            if (classStruct) return _itemsFromStructure(classStruct, 'class', classStruct._id, 'FeeStructure');
        }
    }

    return null;
}

function _itemsFromStructure(struct, level, sourceId, sourceType) {
    return {
        level,
        sourceId,
        sourceType,
        structureId: struct._id,
        items: (struct.items || []).filter(i => i.isActive).map(i => ({
            feeHeadId: i.feeHead?._id, feeName: i.feeHead?.name || '',
            category: i.feeHead?.category || 'custom',
            amount: i.amount, dueDate: i.dueDate, installmentLabel: i.installmentLabel,
        })),
    };
}

function applyRounding(amount, rule) {
    if (rule === 'round') return Math.round(amount);
    if (rule === 'ceil')  return Math.ceil(amount);
    if (rule === 'floor') return Math.floor(amount);
    return Math.round(amount * 100) / 100;
}

function calcConcessionAmount(items, concessions, roundingRule = 'none') {
    let total = 0;
    const breakdown = [];
    for (const item of items) {
        for (const sc of concessions) {
            const c = sc.concession || sc;
            if (!c || !c.isActive) continue;
            const applicable = c.applicableTo === 'all' ||
                (c.applicableTo === 'specific_heads' && c.applicableHeads &&
                 c.applicableHeads.some(h => h.toString() === (item.feeHeadId || '').toString()));
            if (!applicable) continue;
            let amt = c.concessionType === 'percentage'
                ? (item.amount * c.value / 100) : Math.min(c.value, item.amount);
            amt = applyRounding(amt, roundingRule);
            total += amt;
            breakdown.push({ feeName: item.feeName, concessionName: c.name, amount: amt });
        }
    }
    return { totalConcession: total, breakdown };
}

function calcFineAmount(items, fineRule) {
    if (!fineRule || !fineRule.isActive) return 0;
    const now = new Date();
    let total = 0;
    for (const item of items) {
        if (!item.dueDate) continue;
        const graceDue = new Date(
            new Date(item.dueDate).getTime() + (fineRule.gracePeriodDays || 0) * 86400000
        );
        if (now <= graceDue) continue;
        const daysLate = Math.max(1, Math.floor((now - graceDue) / 86400000));
        let fine = fineRule.fineType === 'flat'
            ? fineRule.flatAmount
            : fineRule.perDayAmount * daysLate;
        if (fineRule.maxCap > 0) fine = Math.min(fine, fineRule.maxCap);
        total += fine;
    }
    return Math.round(total * 100) / 100;
}

// Get student's current balance from ledger (positive = owes, negative = credit)
async function getStudentBalance(studentId, academicYearId, schoolId) {
    const last = await FeeLedger.findOne(
        { school: schoolId, student: studentId, academicYear: academicYearId },
        { runningBalance: 1 },
        { sort: { createdAt: -1 } }
    );
    return last ? last.runningBalance : 0;
}

// Create an immutable ledger entry and return it
async function createLedgerEntry(data) {
    const prevBalance = await getStudentBalance(data.student, data.academicYear, data.school);
    const delta = data.entryType === 'debit' ? data.amount : -data.amount;
    const runningBalance = Math.round((prevBalance + delta) * 100) / 100;
    return FeeLedger.create({ ...data, runningBalance });
}

// ── DASHBOARD ────────────────────────────────────────────────────────────────

exports.getDashboard = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const ay = await getActiveAcademicYear(schoolId);

        const [totalCharged, totalCollected, totalConcession, totalFine,
               recentPayments, pendingStudents, feeHeadCount, structureCount] = await Promise.all([
            FeeLedger.aggregate([
                { $match: { school: new mongoose.Types.ObjectId(schoolId), academicYear: ay?._id, category: 'fee_charged' } },
                { $group: { _id: null, total: { $sum: '$amount' } } },
            ]),
            FeeLedger.aggregate([
                { $match: { school: new mongoose.Types.ObjectId(schoolId), academicYear: ay?._id, category: 'payment' } },
                { $group: { _id: null, total: { $sum: '$amount' } } },
            ]),
            FeeLedger.aggregate([
                { $match: { school: new mongoose.Types.ObjectId(schoolId), academicYear: ay?._id, category: 'concession' } },
                { $group: { _id: null, total: { $sum: '$amount' } } },
            ]),
            FeeLedger.aggregate([
                { $match: { school: new mongoose.Types.ObjectId(schoolId), academicYear: ay?._id, category: 'fine' } },
                { $group: { _id: null, total: { $sum: '$amount' } } },
            ]),
            FeePayment.find({ school: schoolId, paymentStatus: 'completed' })
                .sort({ paymentDate: -1 }).limit(10)
                .populate('student', 'name'),
            // Students with positive balance (outstanding dues)
            FeeLedger.aggregate([
                { $match: { school: new mongoose.Types.ObjectId(schoolId), academicYear: ay?._id } },
                { $sort: { createdAt: -1 } },
                { $group: { _id: '$student', runningBalance: { $first: '$runningBalance' } } },
                { $match: { runningBalance: { $gt: 0 } } },
                { $count: 'count' },
            ]),
            FeeHead.countDocuments({ school: schoolId, isActive: true }),
            FeeStructure.countDocuments({ school: schoolId, isActive: true }),
        ]);

        const stats = {
            totalCharged:    totalCharged[0]?.total    || 0,
            totalCollected:  totalCollected[0]?.total  || 0,
            totalConcession: totalConcession[0]?.total || 0,
            totalFine:       totalFine[0]?.total       || 0,
            totalDues:       Math.max(0, (totalCharged[0]?.total || 0) - (totalCollected[0]?.total || 0) - (totalConcession[0]?.total || 0)),
            pendingStudents: pendingStudents[0]?.count  || 0,
            feeHeadCount,
            structureCount,
        };

        res.render('fees/admin/dashboard', {
            title: 'Fees Dashboard', layout: 'layouts/main',
            stats, recentPayments, activeYear: ay,
        });
    } catch (err) {
        console.error('[Fees] getDashboard:', err);
        req.flash('error', 'Failed to load dashboard.');
        res.redirect('/admin/dashboard');
    }
};

// ── FEE HEADS ────────────────────────────────────────────────────────────────

exports.getFeeHeads = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const feeHeads = await FeeHead.find({ school: schoolId }).sort({ category: 1, name: 1 });
        res.render('fees/admin/fee-heads/index', {
            title: 'Fee Heads', layout: 'layouts/main', feeHeads,
        });
    } catch (err) {
        console.error('[Fees] getFeeHeads:', err);
        req.flash('error', 'Failed to load fee heads.');
        res.redirect('/fees/admin/dashboard');
    }
};

exports.getCreateFeeHead = (req, res) => {
    res.render('fees/admin/fee-heads/form', {
        title: 'Create Fee Head', layout: 'layouts/main', feeHead: null, isEdit: false,
    });
};

exports.postCreateFeeHead = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const { name, category, type, defaultAmount, description } = req.body;
        const feeHead = await FeeHead.create({
            school: schoolId, name, category, type,
            defaultAmount: parseFloat(defaultAmount) || 0,
            description, createdBy: req.session.userId,
        });
        await audit(schoolId, req.session.userId, req.session.userRole,
            'FEE_HEAD_CREATED', 'FeeHead', feeHead._id, null, { name, category, type });
        req.flash('success', `Fee head "${name}" created.`);
        res.redirect('/fees/admin/fee-heads');
    } catch (err) {
        if (err.code === 11000) {
            req.flash('error', 'A fee head with this name already exists.');
        } else {
            req.flash('error', 'Failed to create fee head.');
            console.error('[Fees] postCreateFeeHead:', err);
        }
        res.redirect('/fees/admin/fee-heads/create');
    }
};

exports.getEditFeeHead = async (req, res) => {
    try {
        const feeHead = await FeeHead.findOne({ _id: req.params.id, school: req.session.schoolId });
        if (!feeHead) { req.flash('error', 'Fee head not found.'); return res.redirect('/fees/admin/fee-heads'); }
        res.render('fees/admin/fee-heads/form', {
            title: 'Edit Fee Head', layout: 'layouts/main', feeHead, isEdit: true,
        });
    } catch (err) {
        req.flash('error', 'Not found.'); res.redirect('/fees/admin/fee-heads');
    }
};

exports.postEditFeeHead = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const feeHead = await FeeHead.findOne({ _id: req.params.id, school: schoolId });
        if (!feeHead) { req.flash('error', 'Fee head not found.'); return res.redirect('/fees/admin/fee-heads'); }
        const old = { name: feeHead.name, category: feeHead.category, type: feeHead.type };
        const { name, category, type, defaultAmount, description } = req.body;
        Object.assign(feeHead, { name, category, type, defaultAmount: parseFloat(defaultAmount) || 0, description });
        await feeHead.save();
        await audit(schoolId, req.session.userId, req.session.userRole,
            'FEE_HEAD_UPDATED', 'FeeHead', feeHead._id, old, { name, category, type });
        req.flash('success', `Fee head updated.`);
        res.redirect('/fees/admin/fee-heads');
    } catch (err) {
        if (err.code === 11000) req.flash('error', 'A fee head with this name already exists.');
        else { req.flash('error', 'Update failed.'); console.error('[Fees] postEditFeeHead:', err); }
        res.redirect(`/fees/admin/fee-heads/${req.params.id}/edit`);
    }
};

exports.postToggleFeeHead = async (req, res) => {
    try {
        const feeHead = await FeeHead.findOne({ _id: req.params.id, school: req.session.schoolId });
        if (!feeHead) { req.flash('error', 'Fee head not found.'); return res.redirect('/fees/admin/fee-heads'); }
        feeHead.isActive = !feeHead.isActive;
        await feeHead.save();
        await audit(req.session.schoolId, req.session.userId, req.session.userRole,
            feeHead.isActive ? 'FEE_HEAD_ACTIVATED' : 'FEE_HEAD_DEACTIVATED',
            'FeeHead', feeHead._id, null, { isActive: feeHead.isActive });
        req.flash('success', `Fee head ${feeHead.isActive ? 'activated' : 'deactivated'}.`);
        res.redirect('/fees/admin/fee-heads');
    } catch (err) {
        req.flash('error', 'Toggle failed.'); res.redirect('/fees/admin/fee-heads');
    }
};

// ── FEE STRUCTURES ───────────────────────────────────────────────────────────

exports.getFeeStructures = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const ay = await getActiveAcademicYear(schoolId);
        const structures = await FeeStructure.find({ school: schoolId, academicYear: ay?._id })
            .populate('class', 'className classNumber')
            .populate('section', 'sectionName')
            .populate('items.feeHead', 'name')
            .sort({ level: 1, createdAt: -1 });
        const academicYears = await AcademicYear.find({ school: schoolId }).sort({ startDate: -1 });
        res.render('fees/admin/fee-structures/index', {
            title: 'Fee Structures', layout: 'layouts/main', structures, activeYear: ay, academicYears,
        });
    } catch (err) {
        console.error('[Fees] getFeeStructures:', err);
        req.flash('error', 'Failed to load structures.');
        res.redirect('/fees/admin/dashboard');
    }
};

exports.getCreateFeeStructure = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const ay = await getActiveAcademicYear(schoolId);
        const [feeHeads, classes, academicYears] = await Promise.all([
            FeeHead.find({ school: schoolId, isActive: true }).sort({ category: 1, name: 1 }),
            Class.find({ school: schoolId, academicYear: ay?._id, status: 'active' })
                .sort({ classNumber: 1 }),
            AcademicYear.find({ school: schoolId }).sort({ startDate: -1 }),
        ]);
        const sections = await ClassSection.find({ school: schoolId, academicYear: ay?._id, status: 'active' })
            .populate('class', 'className classNumber').sort({ sectionName: 1 });
        res.render('fees/admin/fee-structures/form', {
            title: 'Create Fee Structure', layout: 'layouts/main',
            structure: null, isEdit: false, feeHeads, classes, sections, academicYears, activeYear: ay,
        });
    } catch (err) {
        console.error('[Fees] getCreateFeeStructure:', err);
        req.flash('error', 'Load failed.'); res.redirect('/fees/admin/fee-structures');
    }
};

exports.postCreateFeeStructure = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const { name, level, classId, sectionId, academicYearId, feeHeads, amounts, dueDates, installmentLabels } = req.body;

        const headsArr       = [].concat(feeHeads       || []);
        const amountsArr     = [].concat(amounts         || []);
        const dueDatesArr    = [].concat(dueDates        || []);
        const labelsArr      = [].concat(installmentLabels || []);

        const items = headsArr.map((hId, i) => ({
            feeHead: hId,
            amount:  parseFloat(amountsArr[i]) || 0,
            dueDate: dueDatesArr[i] || null,
            installmentLabel: labelsArr[i] || '',
        })).filter(item => item.amount > 0);

        const totalAmount = items.reduce((s, i) => s + i.amount, 0);
        const ayId = academicYearId || (await getActiveAcademicYear(schoolId))?._id;

        const structure = await FeeStructure.create({
            school: schoolId, academicYear: ayId, name, level,
            class:   level === 'class'   ? classId   : null,
            section: level === 'section' ? sectionId : null,
            items, totalAmount, createdBy: req.session.userId,
        });
        await audit(schoolId, req.session.userId, req.session.userRole,
            'STRUCTURE_CREATED', 'FeeStructure', structure._id, null, { name, level, totalAmount });
        req.flash('success', `Fee structure "${name}" created.`);
        res.redirect('/fees/admin/fee-structures');
    } catch (err) {
        if (err.code === 11000) req.flash('error', 'Duplicate structure for this class/section.');
        else { req.flash('error', 'Create failed.'); console.error('[Fees] postCreateFeeStructure:', err); }
        res.redirect('/fees/admin/fee-structures/create');
    }
};

exports.getFeeStructureDetail = async (req, res) => {
    try {
        const structure = await FeeStructure.findOne({ _id: req.params.id, school: req.session.schoolId })
            .populate('class', 'className classNumber')
            .populate('section', 'sectionName')
            .populate('items.feeHead', 'name category')
            .populate('academicYear', 'yearName')
            .populate('createdBy', 'name');
        if (!structure) { req.flash('error', 'Structure not found.'); return res.redirect('/fees/admin/fee-structures'); }

        // Count students in scope
        let studentCount = 0;
        if (structure.level === 'section' && structure.section) {
            const sec = await ClassSection.findById(structure.section._id || structure.section).select('enrolledStudents');
            studentCount = sec?.enrolledStudents?.length || 0;
        } else if (structure.level === 'class' && structure.class) {
            const secs = await ClassSection.find({ school: req.session.schoolId, class: structure.class._id || structure.class })
                .select('enrolledStudents');
            studentCount = secs.reduce((s, sec) => s + (sec.enrolledStudents?.length || 0), 0);
        }

        res.render('fees/admin/fee-structures/detail', {
            title: `Fee Structure — ${structure.name}`, layout: 'layouts/main', structure, studentCount,
        });
    } catch (err) {
        console.error('[Fees] getFeeStructureDetail:', err);
        req.flash('error', 'Not found.'); res.redirect('/fees/admin/fee-structures');
    }
};

exports.getEditFeeStructure = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const structure = await FeeStructure.findOne({ _id: req.params.id, school: schoolId })
            .populate('items.feeHead', 'name category');
        if (!structure) { req.flash('error', 'Structure not found.'); return res.redirect('/fees/admin/fee-structures'); }
        const ay = await getActiveAcademicYear(schoolId);
        const [feeHeads, classes, academicYears] = await Promise.all([
            FeeHead.find({ school: schoolId, isActive: true }).sort({ category: 1, name: 1 }),
            Class.find({ school: schoolId, status: 'active' }).sort({ classNumber: 1 }),
            AcademicYear.find({ school: schoolId }).sort({ startDate: -1 }),
        ]);
        const sections = await ClassSection.find({ school: schoolId, status: 'active' })
            .populate('class', 'className classNumber').sort({ sectionName: 1 });
        res.render('fees/admin/fee-structures/form', {
            title: `Edit — ${structure.name}`, layout: 'layouts/main',
            structure, isEdit: true, feeHeads, classes, sections, academicYears, activeYear: ay,
        });
    } catch (err) {
        console.error('[Fees] getEditFeeStructure:', err);
        req.flash('error', 'Load failed.'); res.redirect('/fees/admin/fee-structures');
    }
};

exports.postEditFeeStructure = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const structure = await FeeStructure.findOne({ _id: req.params.id, school: schoolId });
        if (!structure) { req.flash('error', 'Not found.'); return res.redirect('/fees/admin/fee-structures'); }

        const { name, level, classId, sectionId, academicYearId, feeHeads, amounts, dueDates, installmentLabels } = req.body;
        const headsArr    = [].concat(feeHeads || []);
        const amountsArr  = [].concat(amounts || []);
        const dueDatesArr = [].concat(dueDates || []);
        const labelsArr   = [].concat(installmentLabels || []);

        const items = headsArr.map((hId, i) => ({
            feeHead: hId, amount: parseFloat(amountsArr[i]) || 0,
            dueDate: dueDatesArr[i] || null, installmentLabel: labelsArr[i] || '',
        })).filter(item => item.amount > 0);

        const old = { name: structure.name, totalAmount: structure.totalAmount };
        structure.name = name;
        structure.level = level;
        structure.class   = level === 'class'   ? classId   : null;
        structure.section = level === 'section' ? sectionId : null;
        structure.items = items;
        structure.totalAmount = items.reduce((s, i) => s + i.amount, 0);
        if (academicYearId) structure.academicYear = academicYearId;
        structure.demandGenerated = false; // reset — structure changed
        await structure.save();
        await audit(schoolId, req.session.userId, req.session.userRole,
            'STRUCTURE_UPDATED', 'FeeStructure', structure._id, old, { name, totalAmount: structure.totalAmount });
        req.flash('success', 'Fee structure updated.');
        res.redirect(`/fees/admin/fee-structures/${structure._id}`);
    } catch (err) {
        req.flash('error', 'Update failed.'); console.error('[Fees] postEditFeeStructure:', err);
        res.redirect('/fees/admin/fee-structures');
    }
};

exports.postToggleFeeStructure = async (req, res) => {
    try {
        const structure = await FeeStructure.findOne({ _id: req.params.id, school: req.session.schoolId });
        if (!structure) { req.flash('error', 'Not found.'); return res.redirect('/fees/admin/fee-structures'); }
        structure.isActive = !structure.isActive;
        await structure.save();
        req.flash('success', `Structure ${structure.isActive ? 'activated' : 'deactivated'}.`);
        res.redirect('/fees/admin/fee-structures');
    } catch (err) {
        req.flash('error', 'Toggle failed.'); res.redirect('/fees/admin/fee-structures');
    }
};

// Generate fee demand for all students in the structure's class/section
exports.postGenerateFeeDemand = async (req, res) => {
    const structureId = req.params.id;
    const schoolId = req.session.schoolId;
    try {
        const structure = await FeeStructure.findOne({ _id: structureId, school: schoolId })
            .populate('items.feeHead');
        if (!structure) throw new Error('Structure not found.');

        let students = [];
        if (structure.level === 'section' && structure.section) {
            const sec = await ClassSection.findById(structure.section).select('enrolledStudents');
            students = sec?.enrolledStudents || [];
        } else if (structure.level === 'class' && structure.class) {
            const secs = await ClassSection.find({ school: schoolId, class: structure.class, status: 'active' })
                .select('enrolledStudents');
            students = secs.flatMap(s => s.enrolledStudents || []);
        }

        if (!students.length) throw new Error('No students found in this class/section. Make sure students are enrolled in sections.');

        let generated = 0;
        for (const studentId of students) {
            // Skip if debit already exists for this structure and student (idempotent)
            const existing = await FeeLedger.findOne({
                school: schoolId, student: studentId, academicYear: structure.academicYear,
                referenceType: 'FeeStructure', referenceId: structure._id, category: 'fee_charged',
            });
            if (existing) continue;

            const activeItems = (structure.items || []).filter(i => i.isActive);
            const totalCharge = activeItems.reduce((s, i) => s + i.amount, 0);
            if (totalCharge <= 0) continue;

            const prevBal = await FeeLedger.findOne(
                { school: schoolId, student: studentId, academicYear: structure.academicYear },
                { runningBalance: 1 }, { sort: { createdAt: -1 } }
            );
            const runningBalance = Math.round(((prevBal?.runningBalance || 0) + totalCharge) * 100) / 100;

            await FeeLedger.create({
                school: schoolId, student: studentId, academicYear: structure.academicYear,
                entryType: 'debit', category: 'fee_charged', amount: totalCharge,
                description: `Fee demand — ${structure.name}`,
                referenceType: 'FeeStructure', referenceId: structure._id,
                runningBalance,
                createdBy: req.session.userId,
            });
            generated++;
        }

        structure.demandGenerated = true;
        await structure.save();
        await audit(schoolId, req.session.userId, req.session.userRole,
            'DEMAND_GENERATED', 'FeeStructure', structure._id, null, { generated, total: students.length });
        req.flash('success', `Fee demand generated for ${generated} student(s).`);
        res.redirect(`/fees/admin/fee-structures/${structure._id}`);
    } catch (err) {
        console.error('[Fees] postGenerateFeeDemand:', err);
        req.flash('error', err.message || 'Demand generation failed.');
        res.redirect(`/fees/admin/fee-structures/${structureId}`);
    }
};

// ── FINE RULES ───────────────────────────────────────────────────────────────

exports.getFineRules = async (req, res) => {
    try {
        const fineRules = await FineRule.find({ school: req.session.schoolId }).sort({ createdAt: -1 });
        res.render('fees/admin/fine-rules/index', { title: 'Fine Rules', layout: 'layouts/main', fineRules });
    } catch (err) {
        req.flash('error', 'Failed to load fine rules.'); res.redirect('/fees/admin/dashboard');
    }
};

exports.getCreateFineRule = (req, res) => {
    res.render('fees/admin/fine-rules/form', { title: 'Create Fine Rule', layout: 'layouts/main', rule: null, isEdit: false });
};

exports.postCreateFineRule = async (req, res) => {
    try {
        const { name, fineType, flatAmount, perDayAmount, gracePeriodDays, maxCap, applicableCategories } = req.body;
        const rule = await FineRule.create({
            school: req.session.schoolId, name, fineType,
            flatAmount: parseFloat(flatAmount) || 0,
            perDayAmount: parseFloat(perDayAmount) || 0,
            gracePeriodDays: parseInt(gracePeriodDays) || 0,
            maxCap: parseFloat(maxCap) || 0,
            applicableCategories: [].concat(applicableCategories || []),
            createdBy: req.session.userId,
        });
        await audit(req.session.schoolId, req.session.userId, req.session.userRole,
            'FINE_RULE_CREATED', 'FineRule', rule._id, null, { name, fineType });
        req.flash('success', `Fine rule "${name}" created.`);
        res.redirect('/fees/admin/fine-rules');
    } catch (err) {
        if (err.code === 11000) req.flash('error', 'A rule with this name already exists.');
        else { req.flash('error', 'Create failed.'); console.error('[Fees] postCreateFineRule:', err); }
        res.redirect('/fees/admin/fine-rules/create');
    }
};

exports.getEditFineRule = async (req, res) => {
    try {
        const rule = await FineRule.findOne({ _id: req.params.id, school: req.session.schoolId });
        if (!rule) { req.flash('error', 'Not found.'); return res.redirect('/fees/admin/fine-rules'); }
        res.render('fees/admin/fine-rules/form', { title: 'Edit Fine Rule', layout: 'layouts/main', rule, isEdit: true });
    } catch (err) { req.flash('error', 'Not found.'); res.redirect('/fees/admin/fine-rules'); }
};

exports.postEditFineRule = async (req, res) => {
    try {
        const rule = await FineRule.findOne({ _id: req.params.id, school: req.session.schoolId });
        if (!rule) { req.flash('error', 'Not found.'); return res.redirect('/fees/admin/fine-rules'); }
        const { name, fineType, flatAmount, perDayAmount, gracePeriodDays, maxCap, applicableCategories } = req.body;
        Object.assign(rule, {
            name, fineType,
            flatAmount: parseFloat(flatAmount) || 0,
            perDayAmount: parseFloat(perDayAmount) || 0,
            gracePeriodDays: parseInt(gracePeriodDays) || 0,
            maxCap: parseFloat(maxCap) || 0,
            applicableCategories: [].concat(applicableCategories || []),
        });
        await rule.save();
        await audit(req.session.schoolId, req.session.userId, req.session.userRole,
            'FINE_RULE_UPDATED', 'FineRule', rule._id, null, { name, fineType });
        req.flash('success', 'Fine rule updated.'); res.redirect('/fees/admin/fine-rules');
    } catch (err) {
        req.flash('error', 'Update failed.'); res.redirect('/fees/admin/fine-rules');
    }
};

exports.postToggleFineRule = async (req, res) => {
    try {
        const rule = await FineRule.findOne({ _id: req.params.id, school: req.session.schoolId });
        if (!rule) { req.flash('error', 'Not found.'); return res.redirect('/fees/admin/fine-rules'); }
        rule.isActive = !rule.isActive; await rule.save();
        req.flash('success', `Rule ${rule.isActive ? 'activated' : 'deactivated'}.`);
        res.redirect('/fees/admin/fine-rules');
    } catch (err) { req.flash('error', 'Toggle failed.'); res.redirect('/fees/admin/fine-rules'); }
};

// ── CONCESSION TEMPLATES ─────────────────────────────────────────────────────

exports.getConcessions = async (req, res) => {
    try {
        const concessions = await FeeConcession.find({ school: req.session.schoolId })
            .populate('applicableHeads', 'name').sort({ createdAt: -1 });
        res.render('fees/admin/concessions/index', { title: 'Concession Templates', layout: 'layouts/main', concessions });
    } catch (err) {
        req.flash('error', 'Failed to load concessions.'); res.redirect('/fees/admin/dashboard');
    }
};

exports.getCreateConcession = async (req, res) => {
    try {
        const feeHeads = await FeeHead.find({ school: req.session.schoolId, isActive: true }).sort({ name: 1 });
        res.render('fees/admin/concessions/form', {
            title: 'Create Concession Template', layout: 'layouts/main',
            concession: null, isEdit: false, feeHeads,
        });
    } catch (err) { req.flash('error', 'Load failed.'); res.redirect('/fees/admin/concessions'); }
};

exports.postCreateConcession = async (req, res) => {
    try {
        const { name, concessionType, value, applicableTo, applicableHeads, description } = req.body;
        const concession = await FeeConcession.create({
            school: req.session.schoolId, name, concessionType,
            value: parseFloat(value) || 0, applicableTo,
            applicableHeads: applicableTo === 'specific_heads' ? [].concat(applicableHeads || []) : [],
            description, createdBy: req.session.userId,
        });
        await audit(req.session.schoolId, req.session.userId, req.session.userRole,
            'CONCESSION_CREATED', 'FeeConcession', concession._id, null, { name, concessionType, value });
        req.flash('success', `Concession template "${name}" created.`);
        res.redirect('/fees/admin/concessions');
    } catch (err) {
        if (err.code === 11000) req.flash('error', 'A concession with this name already exists.');
        else { req.flash('error', 'Create failed.'); console.error('[Fees] postCreateConcession:', err); }
        res.redirect('/fees/admin/concessions/create');
    }
};

exports.getEditConcession = async (req, res) => {
    try {
        const concession = await FeeConcession.findOne({ _id: req.params.id, school: req.session.schoolId })
            .populate('applicableHeads', 'name');
        if (!concession) { req.flash('error', 'Not found.'); return res.redirect('/fees/admin/concessions'); }
        const feeHeads = await FeeHead.find({ school: req.session.schoolId, isActive: true }).sort({ name: 1 });
        res.render('fees/admin/concessions/form', {
            title: `Edit — ${concession.name}`, layout: 'layouts/main',
            concession, isEdit: true, feeHeads,
        });
    } catch (err) { req.flash('error', 'Not found.'); res.redirect('/fees/admin/concessions'); }
};

exports.postEditConcession = async (req, res) => {
    try {
        const concession = await FeeConcession.findOne({ _id: req.params.id, school: req.session.schoolId });
        if (!concession) { req.flash('error', 'Not found.'); return res.redirect('/fees/admin/concessions'); }
        const { name, concessionType, value, applicableTo, applicableHeads, description } = req.body;
        Object.assign(concession, {
            name, concessionType, value: parseFloat(value) || 0, applicableTo, description,
            applicableHeads: applicableTo === 'specific_heads' ? [].concat(applicableHeads || []) : [],
        });
        await concession.save();
        req.flash('success', 'Concession template updated.'); res.redirect('/fees/admin/concessions');
    } catch (err) {
        req.flash('error', 'Update failed.'); res.redirect('/fees/admin/concessions');
    }
};

exports.postToggleConcession = async (req, res) => {
    try {
        const concession = await FeeConcession.findOne({ _id: req.params.id, school: req.session.schoolId });
        if (!concession) { req.flash('error', 'Not found.'); return res.redirect('/fees/admin/concessions'); }
        concession.isActive = !concession.isActive; await concession.save();
        req.flash('success', `Concession ${concession.isActive ? 'activated' : 'deactivated'}.`);
        res.redirect('/fees/admin/concessions');
    } catch (err) { req.flash('error', 'Toggle failed.'); res.redirect('/fees/admin/concessions'); }
};

// ── STUDENT FEE MANAGEMENT ───────────────────────────────────────────────────

exports.getStudentFees = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const ay = await getActiveAcademicYear(schoolId);
        const { search, classId, sectionId } = req.query;

        const filter = { school: schoolId, role: 'student', isActive: true };
        if (search) filter.name = { $regex: search, $options: 'i' };

        let students = await User.find(filter).select('name email').lean();

        // Fetch all student profiles for section/class filter
        let profileFilter = { school: schoolId };
        if (sectionId) profileFilter.currentSection = sectionId;
        const profiles = await StudentProfile.find(profileFilter)
            .populate({ path: 'currentSection', populate: { path: 'class', select: 'className classNumber' } })
            .select('user currentSection admissionNumber').lean();
        const profileMap = {};
        profiles.forEach(p => { profileMap[p.user.toString()] = p; });

        // Filter by class if needed
        if (classId) {
            students = students.filter(s => {
                const p = profileMap[s._id.toString()];
                return p?.currentSection?.class?._id?.toString() === classId;
            });
        }

        // Get last ledger balance for each student
        const studentIds = students.map(s => s._id);
        const balances = await FeeLedger.aggregate([
            { $match: { school: new mongoose.Types.ObjectId(schoolId), academicYear: ay?._id, student: { $in: studentIds } } },
            { $sort: { createdAt: -1 } },
            { $group: { _id: '$student', runningBalance: { $first: '$runningBalance' } } },
        ]);
        const balanceMap = {};
        balances.forEach(b => { balanceMap[b._id.toString()] = b.runningBalance; });

        const result = students.map(s => ({
            ...s, profile: profileMap[s._id.toString()],
            balance: balanceMap[s._id.toString()] || 0,
        })).sort((a, b) => (b.balance - a.balance));

        const [classes, allSections] = await Promise.all([
            Class.find({ school: schoolId, academicYear: ay?._id, status: 'active' }).sort({ classNumber: 1 }),
            ClassSection.find({ school: schoolId, academicYear: ay?._id, status: 'active' })
                .populate('class', 'className classNumber').sort({ sectionName: 1 }),
        ]);

        res.render('fees/admin/student-fees/index', {
            title: 'Student Fee Management', layout: 'layouts/main',
            students: result, activeYear: ay, classes, allSections,
            search, classId, sectionId,
        });
    } catch (err) {
        console.error('[Fees] getStudentFees:', err);
        req.flash('error', 'Failed to load students.'); res.redirect('/fees/admin/dashboard');
    }
};

exports.getStudentFeeDetail = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const student = await User.findOne({ _id: req.params.studentId, school: schoolId, role: 'student' }).select('name email');
        if (!student) { req.flash('error', 'Student not found.'); return res.redirect('/fees/admin/student-fees'); }
        const ay = await getActiveAcademicYear(schoolId);
        const [profile, ledgerEntries, payments, studentConcessions, fineRules] = await Promise.all([
            StudentProfile.findOne({ user: student._id, school: schoolId })
                .populate({ path: 'currentSection', populate: { path: 'class' } }),
            FeeLedger.find({ school: schoolId, student: student._id, academicYear: ay?._id })
                .sort({ createdAt: -1 }).limit(50),
            FeePayment.find({ school: schoolId, student: student._id, academicYear: ay?._id, paymentStatus: 'completed' })
                .sort({ paymentDate: -1 }),
            StudentConcession.find({ school: schoolId, student: student._id, academicYear: ay?._id, isActive: true })
                .populate('concession'),
            FineRule.find({ school: schoolId, isActive: true }),
        ]);

        const resolved = await resolveFeeItems(student._id, ay?._id, schoolId);
        const settings = await getOrCreateSettings(schoolId);
        const concData = resolved ? calcConcessionAmount(resolved.items, studentConcessions, settings.roundingRule) : { totalConcession: 0 };
        const fineAmt = resolved && fineRules.length ? calcFineAmount(resolved.items, fineRules[0]) : 0;
        const balance = ledgerEntries.length ? ledgerEntries[0].runningBalance : 0;

        const concessionTemplates = await FeeConcession.find({ school: schoolId, isActive: true });

        res.render('fees/admin/student-fees/detail', {
            title: `Fees — ${student.name}`, layout: 'layouts/main',
            student, profile, ay, ledgerEntries, payments, studentConcessions,
            resolved, concData, fineAmt, balance, concessionTemplates,
        });
    } catch (err) {
        console.error('[Fees] getStudentFeeDetail:', err);
        req.flash('error', 'Failed to load student details.'); res.redirect('/fees/admin/student-fees');
    }
};

exports.postAssignStudentConcession = async (req, res) => {
    const { studentId } = req.params;
    try {
        const schoolId = req.session.schoolId;
        const { concessionId, validFrom, validTo, remarks } = req.body;
        const ay = await getActiveAcademicYear(schoolId);

        const concession = await FeeConcession.findOne({ _id: concessionId, school: schoolId, isActive: true });
        if (!concession) throw new Error('Concession template not found.');

        const sc = await StudentConcession.create({
            school: schoolId, student: studentId, academicYear: ay._id,
            concession: concessionId, validFrom: validFrom || null, validTo: validTo || null,
            remarks, approvedBy: req.session.userId, createdBy: req.session.userId,
        });

        // Create a credit ledger entry for the concession
        const resolved = await resolveFeeItems(studentId, ay._id, schoolId);
        const settings = await getOrCreateSettings(schoolId);
        if (resolved) {
            const { totalConcession } = calcConcessionAmount(resolved.items, [{ concession }], settings.roundingRule);
            if (totalConcession > 0) {
                await createLedgerEntry({
                    school: schoolId, student: studentId, academicYear: ay._id,
                    entryType: 'credit', category: 'concession', amount: totalConcession,
                    description: `Concession applied — ${concession.name}`,
                    referenceType: 'StudentConcession', referenceId: sc._id,
                    createdBy: req.session.userId,
                });
            }
        }

        await audit(schoolId, req.session.userId, req.session.userRole,
            'CONCESSION_ASSIGNED', 'StudentConcession', sc._id, null, { studentId, concessionId });
        req.flash('success', `Concession "${concession.name}" assigned.`);
        res.redirect(`/fees/admin/student-fees/${studentId}`);
    } catch (err) {
        req.flash('error', err.message || 'Failed to assign concession.');
        res.redirect(`/fees/admin/student-fees/${studentId}`);
    }
};

exports.postRemoveStudentConcession = async (req, res) => {
    try {
        const sc = await StudentConcession.findOne({ _id: req.params.concessionId, school: req.session.schoolId });
        if (!sc) { req.flash('error', 'Not found.'); return res.redirect(`/fees/admin/student-fees/${req.params.studentId}`); }
        sc.isActive = false; await sc.save();
        req.flash('success', 'Concession removed.'); res.redirect(`/fees/admin/student-fees/${req.params.studentId}`);
    } catch (err) { req.flash('error', 'Remove failed.'); res.redirect(`/fees/admin/student-fees/${req.params.studentId}`); }
};

// ── PAYMENTS ─────────────────────────────────────────────────────────────────

exports.getPayments = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const { from, to, mode, status } = req.query;
        const filter = { school: schoolId };
        if (from || to) {
            filter.paymentDate = {};
            if (from) filter.paymentDate.$gte = new Date(from);
            if (to)   filter.paymentDate.$lte = new Date(new Date(to).setHours(23, 59, 59));
        }
        if (mode)   filter.paymentMode = mode;
        if (status) filter.paymentStatus = status;

        const payments = await FeePayment.find(filter)
            .sort({ paymentDate: -1 }).limit(200)
            .populate('student', 'name')
            .populate('collectedBy', 'name');
        const total = payments.filter(p => p.paymentStatus === 'completed').reduce((s, p) => s + p.amount, 0);
        res.render('fees/admin/payments/index', {
            title: 'Fee Payments', layout: 'layouts/main', payments, total, from, to, mode, status,
        });
    } catch (err) {
        console.error('[Fees] getPayments:', err);
        req.flash('error', 'Failed to load payments.'); res.redirect('/fees/admin/dashboard');
    }
};

exports.getRecordPayment = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const { studentId } = req.query;
        const ay = await getActiveAcademicYear(schoolId);

        let student = null, resolved = null, balance = 0, feeHeads = [];
        if (studentId) {
            student = await User.findOne({ _id: studentId, school: schoolId, role: 'student' }).select('name email');
            resolved = await resolveFeeItems(studentId, ay?._id, schoolId);
            balance  = await getStudentBalance(studentId, ay?._id, schoolId);
        }
        feeHeads = await FeeHead.find({ school: schoolId, isActive: true }).sort({ category: 1, name: 1 });

        const students = await User.find({ school: schoolId, role: 'student', isActive: true })
            .select('name').sort({ name: 1 });

        res.render('fees/admin/payments/record', {
            title: 'Record Payment', layout: 'layouts/main',
            student, students, resolved, balance, ay, feeHeads, studentId: studentId || '',
        });
    } catch (err) {
        console.error('[Fees] getRecordPayment:', err);
        req.flash('error', 'Load failed.'); res.redirect('/fees/admin/payments');
    }
};

exports.postRecordPayment = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const { studentId, amount, paymentMode, transactionRef, paymentDate, remarks, feeHeadIds, feeAmounts, feeNames } = req.body;
        const ay = await getActiveAcademicYear(schoolId);
        if (!ay) throw new Error('No active academic year.');

        const payAmt = parseFloat(amount);
        if (!payAmt || payAmt <= 0) throw new Error('Invalid payment amount.');

        const student = await User.findOne({ _id: studentId, school: schoolId, role: 'student' });
        if (!student) throw new Error('Student not found.');

        // Build payment lines from form
        const headsArr   = [].concat(feeHeadIds || []);
        const amountsArr = [].concat(feeAmounts || []);
        const namesArr   = [].concat(feeNames   || []);
        const lines = headsArr.map((hId, i) => ({
            feeHead: hId || null, feeName: namesArr[i] || 'Fee',
            amount: parseFloat(amountsArr[i]) || 0,
        })).filter(l => l.amount > 0);

        if (!lines.length) {
            lines.push({ feeHead: null, feeName: 'Fee Payment', amount: payAmt });
        }

        const receiptNumber = await generateReceiptNumber(schoolId);

        const payment = await FeePayment.create({
            school: schoolId, student: studentId, academicYear: ay._id,
            receiptNumber, amount: payAmt, lines, paymentMode,
            paymentStatus: 'completed', transactionRef: transactionRef || '',
            paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
            remarks, collectedBy: req.session.userId,
            idempotencyKey: `${schoolId}-${studentId}-${Date.now()}`,
            schoolSnapshot: { name: req.session.schoolName },
            studentSnapshot: { name: student.name, id: student._id },
        });

        const prevBalance = await getStudentBalance(studentId, ay._id, schoolId);
        const ledgerEntry = await FeeLedger.create({
            school: schoolId, student: studentId, academicYear: ay._id,
            entryType: 'credit', category: 'payment', amount: payAmt,
            description: `Payment received — Receipt ${receiptNumber}`,
            referenceType: 'FeePayment', referenceId: payment._id,
            runningBalance: Math.round((prevBalance - payAmt) * 100) / 100,
            createdBy: req.session.userId,
        });

        payment.ledgerEntry = ledgerEntry._id;
        await payment.save();

        await audit(schoolId, req.session.userId, req.session.userRole,
            'PAYMENT_RECORDED', 'FeePayment', payment._id, null,
            { amount: payAmt, receiptNumber, paymentMode });

        req.flash('success', `Payment of ₹${payAmt.toLocaleString('en-IN')} recorded. Receipt: ${receiptNumber}`);
        res.redirect(`/fees/admin/payments/${payment._id}/receipt`);
    } catch (err) {
        console.error('[Fees] postRecordPayment:', err);
        req.flash('error', err.message || 'Payment recording failed.');
        res.redirect('/fees/admin/payments/record');
    }
};

exports.postApprovePayment = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const payment  = await FeePayment.findOne({ _id: req.params.id, school: schoolId });
        if (!payment) throw new Error('Payment not found.');
        if (payment.paymentStatus !== 'pending') throw new Error('Only pending payments can be approved.');

        const ay = await getActiveAcademicYear(schoolId);
        const receiptNumber = await generateReceiptNumber(schoolId);
        const prevBalance   = await getStudentBalance(payment.student, payment.academicYear || ay._id, schoolId);

        const ledgerEntry = await FeeLedger.create({
            school: schoolId, student: payment.student, academicYear: payment.academicYear || ay._id,
            entryType: 'credit', category: 'payment', amount: payment.amount,
            description: `Payment received — Receipt ${receiptNumber}`,
            referenceType: 'FeePayment', referenceId: payment._id,
            runningBalance: Math.round((prevBalance - payment.amount) * 100) / 100,
            createdBy: req.session.userId,
        });

        payment.paymentStatus = 'completed';
        payment.receiptNumber = receiptNumber;
        payment.ledgerEntry   = ledgerEntry._id;
        payment.collectedBy   = req.session.userId;
        await payment.save();

        await audit(schoolId, req.session.userId, req.session.userRole,
            'PAYMENT_APPROVED', 'FeePayment', payment._id, null, { receiptNumber, amount: payment.amount });

        req.flash('success', `Payment approved. Receipt: ${receiptNumber}`);
        res.redirect('/fees/admin/payments');
    } catch (err) {
        console.error('[Fees] postApprovePayment:', err);
        req.flash('error', err.message || 'Approval failed.');
        res.redirect('/fees/admin/payments');
    }
};

exports.postRejectPayment = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const payment  = await FeePayment.findOne({ _id: req.params.id, school: schoolId });
        if (!payment) throw new Error('Payment not found.');
        if (payment.paymentStatus !== 'pending') throw new Error('Only pending payments can be rejected.');

        payment.paymentStatus = 'failed';
        payment.remarks = (payment.remarks ? payment.remarks + ' | ' : '') + `Rejected by admin: ${req.body.reason || 'No reason given'}`;
        await payment.save();

        await audit(schoolId, req.session.userId, req.session.userRole,
            'PAYMENT_REJECTED', 'FeePayment', payment._id, null, { reason: req.body.reason });

        req.flash('success', 'Payment rejected.');
        res.redirect('/fees/admin/payments');
    } catch (err) {
        console.error('[Fees] postRejectPayment:', err);
        req.flash('error', err.message || 'Rejection failed.');
        res.redirect('/fees/admin/payments');
    }
};

exports.getPaymentReceipt = async (req, res) => {
    try {
        const payment = await FeePayment.findOne({ _id: req.params.id, school: req.session.schoolId })
            .populate('student', 'name email')
            .populate('collectedBy', 'name')
            .populate('lines.feeHead', 'name');
        if (!payment) { req.flash('error', 'Payment not found.'); return res.redirect('/fees/admin/payments'); }
        const settings = await getOrCreateSettings(req.session.schoolId);
        res.render('fees/admin/payments/receipt', {
            title: `Receipt — ${payment.receiptNumber}`, layout: 'layouts/main', payment, settings,
        });
    } catch (err) {
        req.flash('error', 'Not found.'); res.redirect('/fees/admin/payments');
    }
};

exports.getDownloadReceipt = async (req, res) => {
    try {
        const payment = await FeePayment.findOne({ _id: req.params.id, school: req.session.schoolId })
            .populate('student', 'name email')
            .populate('collectedBy', 'name')
            .populate('lines.feeHead', 'name');
        if (!payment) { req.flash('error', 'Payment not found.'); return res.redirect('/fees/admin/payments'); }
        const settings = await getOrCreateSettings(req.session.schoolId);
        const School   = require('../models/School');
        const school   = await School.findById(req.session.schoolId);
        generateReceiptPDF(res, payment, school, settings, `receipt-${payment.receiptNumber}.pdf`);
    } catch (err) {
        console.error('[Fees] getDownloadReceipt:', err);
        req.flash('error', 'Download failed.'); res.redirect('/fees/admin/payments');
    }
};

// ── LEDGER ───────────────────────────────────────────────────────────────────

exports.getSchoolLedger = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const ay = await getActiveAcademicYear(schoolId);
        const { category, from, to } = req.query;
        const filter = { school: schoolId, academicYear: ay?._id };
        if (category) filter.category = category;
        if (from || to) {
            filter.createdAt = {};
            if (from) filter.createdAt.$gte = new Date(from);
            if (to)   filter.createdAt.$lte = new Date(new Date(to).setHours(23, 59, 59));
        }
        const entries = await FeeLedger.find(filter)
            .populate('student', 'name').sort({ createdAt: -1 }).limit(300);
        res.render('fees/admin/ledger', {
            title: 'Fee Ledger', layout: 'layouts/main', entries, activeYear: ay, category, from, to,
        });
    } catch (err) {
        console.error('[Fees] getSchoolLedger:', err);
        req.flash('error', 'Failed to load ledger.'); res.redirect('/fees/admin/dashboard');
    }
};

exports.getStudentLedger = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const student = await User.findOne({ _id: req.params.studentId, school: schoolId }).select('name');
        if (!student) { req.flash('error', 'Student not found.'); return res.redirect('/fees/admin/student-fees'); }
        const ay = await getActiveAcademicYear(schoolId);
        const entries = await FeeLedger.find({ school: schoolId, student: student._id, academicYear: ay?._id })
            .sort({ createdAt: -1 });
        const balance = entries.length ? entries[0].runningBalance : 0;
        res.render('fees/admin/student-fees/ledger', {
            title: `Ledger — ${student.name}`, layout: 'layouts/main',
            student, entries, balance, activeYear: ay,
        });
    } catch (err) {
        req.flash('error', 'Failed to load ledger.'); res.redirect('/fees/admin/student-fees');
    }
};

// ── REPORTS ──────────────────────────────────────────────────────────────────

exports.getCollectionReport = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const ay = await getActiveAcademicYear(schoolId);
        const { from, to, mode } = req.query;
        const match = {
            school: new mongoose.Types.ObjectId(schoolId),
            academicYear: ay?._id,
            paymentStatus: 'completed',
        };
        if (from || to) {
            match.paymentDate = {};
            if (from) match.paymentDate.$gte = new Date(from);
            if (to)   match.paymentDate.$lte = new Date(new Date(to).setHours(23, 59, 59));
        }
        if (mode) match.paymentMode = mode;

        const [byMode, daily, total] = await Promise.all([
            FeePayment.aggregate([
                { $match: match },
                { $group: { _id: '$paymentMode', count: { $sum: 1 }, total: { $sum: '$amount' } } },
                { $sort: { total: -1 } },
            ]),
            FeePayment.aggregate([
                { $match: match },
                { $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$paymentDate' } },
                    count: { $sum: 1 }, total: { $sum: '$amount' },
                }},
                { $sort: { _id: -1 } }, { $limit: 30 },
            ]),
            FeePayment.aggregate([
                { $match: match },
                { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$amount' } } },
            ]),
        ]);

        res.render('fees/admin/reports/collection', {
            title: 'Collection Report', layout: 'layouts/main',
            byMode, daily, total: total[0] || { count: 0, total: 0 },
            activeYear: ay, from, to, mode,
        });
    } catch (err) {
        console.error('[Fees] getCollectionReport:', err);
        req.flash('error', 'Report failed.'); res.redirect('/fees/admin/dashboard');
    }
};

exports.getDuesReport = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const ay = await getActiveAcademicYear(schoolId);

        const balances = await FeeLedger.aggregate([
            { $match: { school: new mongoose.Types.ObjectId(schoolId), academicYear: ay?._id } },
            { $sort: { createdAt: -1 } },
            { $group: { _id: '$student', runningBalance: { $first: '$runningBalance' } } },
            { $match: { runningBalance: { $gt: 0 } } },
            { $sort: { runningBalance: -1 } },
        ]);

        const studentIds = balances.map(b => b._id);
        const students   = await User.find({ _id: { $in: studentIds } }).select('name email').lean();
        const studentMap = {};
        students.forEach(s => { studentMap[s._id.toString()] = s; });

        const profiles = await StudentProfile.find({ user: { $in: studentIds }, school: schoolId })
            .populate({ path: 'currentSection', populate: { path: 'class', select: 'className' } })
            .select('user currentSection admissionNumber').lean();
        const profileMap = {};
        profiles.forEach(p => { profileMap[p.user.toString()] = p; });

        const result = balances.map(b => ({
            student: studentMap[b._id.toString()],
            profile: profileMap[b._id.toString()],
            outstanding: b.runningBalance,
        })).filter(r => r.student);

        const totalDues = result.reduce((s, r) => s + r.outstanding, 0);
        res.render('fees/admin/reports/dues', {
            title: 'Dues Report', layout: 'layouts/main', result, totalDues, activeYear: ay,
        });
    } catch (err) {
        console.error('[Fees] getDuesReport:', err);
        req.flash('error', 'Report failed.'); res.redirect('/fees/admin/dashboard');
    }
};

exports.getConcessionReport = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const ay = await getActiveAcademicYear(schoolId);

        const concessions = await StudentConcession.find({ school: schoolId, academicYear: ay?._id })
            .populate('student', 'name')
            .populate('concession')
            .populate('approvedBy', 'name')
            .sort({ createdAt: -1 });

        const totalConcessionAmt = await FeeLedger.aggregate([
            { $match: { school: new mongoose.Types.ObjectId(schoolId), academicYear: ay?._id, category: 'concession' } },
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]);

        res.render('fees/admin/reports/concession', {
            title: 'Concession Report', layout: 'layouts/main',
            concessions, totalConcessionAmt: totalConcessionAmt[0]?.total || 0, activeYear: ay,
        });
    } catch (err) {
        console.error('[Fees] getConcessionReport:', err);
        req.flash('error', 'Report failed.'); res.redirect('/fees/admin/dashboard');
    }
};

// ── SETTINGS ─────────────────────────────────────────────────────────────────

exports.getSettings = async (req, res) => {
    try {
        const settings = await getOrCreateSettings(req.session.schoolId);
        res.render('fees/admin/settings', {
            title: 'Fee Settings', layout: 'layouts/main', settings,
        });
    } catch (err) {
        req.flash('error', 'Failed to load settings.'); res.redirect('/fees/admin/dashboard');
    }
};

exports.postSettings = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const {
            onlinePaymentEnabled, paymentGateway, razorpayKeyId, razorpayKeySecret,
            stripePublishableKey, stripeSecretKey, currency, currencySymbol, roundingRule,
            receiptPrefix, receiptHeader, receiptFooter, receiptCustomNotes,
        } = req.body;

        const settings = await getOrCreateSettings(schoolId);
        Object.assign(settings, {
            onlinePaymentEnabled: !!onlinePaymentEnabled,
            paymentGateway: paymentGateway || 'none',
            razorpayKeyId:      razorpayKeyId      || '',
            razorpayKeySecret:  razorpayKeySecret  || '',
            stripePublishableKey: stripePublishableKey || '',
            stripeSecretKey:     stripeSecretKey    || '',
            currency:       currency       || 'INR',
            currencySymbol: currencySymbol || '₹',
            roundingRule:   roundingRule   || 'none',
            receiptPrefix:  receiptPrefix  || 'REC',
            receipt: {
                header:      receiptHeader      || '',
                footer:      receiptFooter      || '',
                customNotes: receiptCustomNotes || '',
            },
        });
        await settings.save();
        await audit(schoolId, req.session.userId, req.session.userRole,
            'SETTINGS_UPDATED', 'FeeSettings', settings._id, null, { paymentGateway, currency });
        req.flash('success', 'Fee settings saved.');
        res.redirect('/fees/admin/settings');
    } catch (err) {
        console.error('[Fees] postSettings:', err);
        req.flash('error', 'Save failed.'); res.redirect('/fees/admin/settings');
    }
};

// ── API ENDPOINTS ─────────────────────────────────────────────────────────────

exports.apiGetStudentBalance = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const ay = await getActiveAcademicYear(schoolId);
        const balance = await getStudentBalance(req.params.studentId, ay?._id, schoolId);
        const resolved = await resolveFeeItems(req.params.studentId, ay?._id, schoolId);
        res.json({ ok: true, balance, resolved });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
};

exports.apiGetSections = async (req, res) => {
    try {
        const sections = await ClassSection.find({
            school: req.session.schoolId, class: req.params.classId, status: 'active',
        }).select('sectionName').sort({ sectionName: 1 });
        res.json({ ok: true, sections });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
};
