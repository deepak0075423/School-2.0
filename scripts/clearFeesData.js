/**
 * clearFeesData.js — Wipe all fee transactional data for a school.
 * Keeps: FeeHead, FineRule, FeeConcession, FeeSettings (admin-configured master data).
 * Clears: FeeStructure, FeeLedger, FeePayment, StudentFeeAssignment, StudentConcession, FeeAuditLog
 *
 * Usage:
 *   node scripts/clearFeesData.js <schoolId>
 *   node scripts/clearFeesData.js <schoolId> --all   (also clears FeeHead, FineRule, FeeConcession)
 */
require('dotenv').config();
const mongoose = require('mongoose');
const readline = require('readline');

const FeeStructure         = require('../models/FeeStructure');
const FeeLedger            = require('../models/FeeLedger');
const FeePayment           = require('../models/FeePayment');
const StudentFeeAssignment = require('../models/StudentFeeAssignment');
const StudentConcession    = require('../models/StudentConcession');
const FeeAuditLog          = require('../models/FeeAuditLog');
const FeeHead              = require('../models/FeeHead');
const FeeCategory          = require('../models/FeeCategory');
const FineRule             = require('../models/FineRule');
const FeeConcession        = require('../models/FeeConcession');
const FeeSettings          = require('../models/FeeSettings');

const DB_URI   = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/school_management';
const schoolId = process.argv[2];
const clearAll = process.argv.includes('--all');

if (!schoolId) {
    console.error('Usage: node scripts/clearFeesData.js <schoolId> [--all]');
    process.exit(1);
}

function prompt(question) {
    return new Promise(resolve => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(question, answer => { rl.close(); resolve(answer.trim().toLowerCase()); });
    });
}

async function deleteAndLog(Model, filter, label) {
    const result = await Model.deleteMany(filter);
    console.log(`  ✓ ${label}: ${result.deletedCount} records deleted`);
}

async function main() {
    await mongoose.connect(DB_URI);
    console.log('\n[clearFeesData] Connected to:', DB_URI);
    console.log('[clearFeesData] School ID  :', schoolId);

    if (clearAll) {
        console.log('\n⚠️  --all flag set: will also clear FeeHead, FineRule, FeeConcession, FeeSettings');
    }

    console.log('\nThe following data will be PERMANENTLY deleted:');
    console.log('  • FeeStructure (and demand start/generation state)');
    console.log('  • FeeLedger (all charges, payments, concessions, fines)');
    console.log('  • FeePayment (all payment records & receipts)');
    console.log('  • StudentFeeAssignment (custom fee assignments)');
    console.log('  • StudentConcession (student-level concession links)');
    console.log('  • FeeAuditLog (audit trail)');
    if (clearAll) {
        console.log('  • FeeHead, FineRule, FeeConcession, FeeSettings');
    }

    const answer = await prompt('\nType "yes" to confirm: ');
    if (answer !== 'yes') {
        console.log('Aborted.');
        process.exit(0);
    }

    console.log('\nClearing...');
    const filter = { school: schoolId };

    await deleteAndLog(FeeStructure,         filter, 'FeeStructure');
    await deleteAndLog(FeeLedger,            filter, 'FeeLedger');
    await deleteAndLog(FeePayment,           filter, 'FeePayment');
    await deleteAndLog(StudentFeeAssignment, filter, 'StudentFeeAssignment');
    await deleteAndLog(StudentConcession,    filter, 'StudentConcession');
    await deleteAndLog(FeeAuditLog,          filter, 'FeeAuditLog');

    if (clearAll) {
        await deleteAndLog(FeeHead,       filter, 'FeeHead');
        await deleteAndLog(FeeCategory,   filter, 'FeeCategory');
        await deleteAndLog(FineRule,      filter, 'FineRule');
        await deleteAndLog(FeeConcession, filter, 'FeeConcession');
        await deleteAndLog(FeeSettings,   filter, 'FeeSettings');
    }

    await mongoose.disconnect();
    console.log('\n[clearFeesData] Done. All selected fee data has been cleared.');
    console.log('Next steps:');
    if (clearAll) {
        console.log('  1. Run: node scripts/seedFees.js <schoolId>  (to restore default fee heads)');
        console.log('  2. Create fee heads in admin panel');
    }
    console.log('  → Create a new fee structure in admin panel');
    console.log('  → Click "Generate Fee Demand" on the structure');
}

main().catch(err => { console.error('[clearFeesData] Fatal:', err); process.exit(1); });
