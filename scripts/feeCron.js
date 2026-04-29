/**
 * feeCron.js — Late-fee auto-calculation cron
 *
 * Run via: node scripts/feeCron.js
 * Or schedule with PM2 / system cron:  0 1 * * * node /path/to/scripts/feeCron.js
 *
 * For each school with fees module enabled:
 *   1. Find all active fine rules
 *   2. Resolve each active student's fee items
 *   3. If any item is past due + grace period, create a DEBIT fine ledger entry
 *   4. Skip students who already have a fine entry for today
 */

require('dotenv').config();
const mongoose = require('mongoose');

const School               = require('../models/School');
const AcademicYear         = require('../models/AcademicYear');
const User                 = require('../models/User');
const StudentProfile       = require('../models/StudentProfile');
const FineRule             = require('../models/FineRule');
const FeeStructure         = require('../models/FeeStructure');
const StudentFeeAssignment = require('../models/StudentFeeAssignment');
const FeeLedger            = require('../models/FeeLedger');

const DB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/school';

async function getStudentFeeItems(studentId, academicYearId, schoolId) {
    const sfa = await StudentFeeAssignment.findOne({
        school: schoolId, student: studentId, academicYear: academicYearId, isActive: true,
    }).populate({ path: 'feeStructure', populate: { path: 'items.feeHead' } });
    if (sfa && sfa.feeStructure) {
        return (sfa.feeStructure.items || []).filter(i => i.isActive);
    }

    const sp = await StudentProfile.findOne({ user: studentId, school: schoolId })
        .populate({ path: 'currentSection', populate: { path: 'class' } });
    if (!sp || !sp.currentSection) return [];

    const sectionStruct = await FeeStructure.findOne({
        school: schoolId, academicYear: academicYearId,
        level: 'section', section: sp.currentSection._id, isActive: true,
    });
    if (sectionStruct) return (sectionStruct.items || []).filter(i => i.isActive);

    const classId = sp.currentSection.class?._id || sp.currentSection.class;
    if (!classId) return [];
    const classStruct = await FeeStructure.findOne({
        school: schoolId, academicYear: academicYearId,
        level: 'class', class: classId, isActive: true,
    });
    return classStruct ? (classStruct.items || []).filter(i => i.isActive) : [];
}

function calcFine(items, rule, date = new Date()) {
    let total = 0;
    const details = [];
    for (const item of items) {
        if (!item.dueDate) continue;
        const graceDue = new Date(
            new Date(item.dueDate).getTime() + (rule.gracePeriodDays || 0) * 86400000
        );
        if (date <= graceDue) continue;
        const daysLate = Math.max(1, Math.floor((date - graceDue) / 86400000));
        let fine = rule.fineType === 'flat' ? rule.flatAmount : rule.perDayAmount * daysLate;
        if (rule.maxCap > 0) fine = Math.min(fine, rule.maxCap);
        total += fine;
        details.push({ feeName: item.feeHead?.name || 'Fee', daysLate, fine });
    }
    return { total: Math.round(total * 100) / 100, details };
}

async function runForSchool(school) {
    const ay = await AcademicYear.findOne({ school: school._id, status: 'active' });
    if (!ay) return;

    const fineRules = await FineRule.find({ school: school._id, isActive: true });
    if (!fineRules.length) return;

    const students = await User.find({ school: school._id, role: 'student', isActive: true }).select('_id');
    const today    = new Date();
    const todayKey = today.toISOString().split('T')[0]; // YYYY-MM-DD

    let fineCount = 0;
    for (const student of students) {
        const items = await getStudentFeeItems(student._id, ay._id, school._id);
        if (!items.length) continue;

        for (const rule of fineRules) {
            const { total, details } = calcFine(items, rule, today);
            if (total <= 0) continue;

            // Idempotency: skip if fine already logged today for this rule
            const existingToday = await FeeLedger.findOne({
                school: school._id, student: student._id, academicYear: ay._id,
                category: 'fine', referenceId: rule._id,
                createdAt: { $gte: new Date(todayKey), $lt: new Date(today.getTime() + 86400000) },
            });
            if (existingToday) continue;

            const prevEntry = await FeeLedger.findOne(
                { school: school._id, student: student._id, academicYear: ay._id },
                { runningBalance: 1 }, { sort: { createdAt: -1 } }
            );
            const running = ((prevEntry?.runningBalance || 0) + total);

            await FeeLedger.create({
                school: school._id, student: student._id, academicYear: ay._id,
                entryType: 'debit', category: 'fine', amount: total,
                description: `Late fine — ${rule.name} (${details.map(d => `${d.daysLate} days`).join(', ')})`,
                referenceType: 'FineRule', referenceId: rule._id,
                runningBalance: Math.round(running * 100) / 100,
                createdBy: null,
            });
            fineCount++;
        }
    }
    console.log(`  [${school.name}] Fine entries created: ${fineCount}`);
}

async function main() {
    console.log('[feeCron] Starting late-fee calculation —', new Date().toISOString());
    await mongoose.connect(DB_URI);

    const schools = await School.find({ isActive: true, 'modules.fees': true });
    console.log(`[feeCron] Processing ${schools.length} school(s)…`);

    for (const school of schools) {
        try {
            console.log(`  Processing: ${school.name}`);
            await runForSchool(school);
        } catch (err) {
            console.error(`  Error for school ${school.name}:`, err.message);
        }
    }

    await mongoose.disconnect();
    console.log('[feeCron] Done.');
}

main().catch(err => { console.error('[feeCron] Fatal:', err); process.exit(1); });
