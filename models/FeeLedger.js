const mongoose = require('mongoose');

// Immutable double-entry ledger — source of truth for all financial positions
const FeeLedgerSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    academicYear: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    entryType: { type: String, enum: ['debit', 'credit'], required: true },
    category: {
        type: String,
        enum: ['fee_charged', 'payment', 'concession', 'fine', 'refund', 'adjustment'],
        required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    description: { type: String, required: true },
    referenceType: {
        type: String,
        enum: ['FeeStructure', 'StudentFeeAssignment', 'FeePayment', 'StudentConcession', 'FineRule', 'Manual'],
        default: 'Manual',
    },
    referenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    runningBalance: { type: Number, default: 0 }, // positive = owes money, negative = credit/overpaid
    feeHeadName: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdAt: { type: Date, default: Date.now, immutable: true },
});

// No updates or deletes — append-only
FeeLedgerSchema.index({ school: 1, student: 1, academicYear: 1, createdAt: -1 });
FeeLedgerSchema.index({ school: 1, createdAt: -1 });
FeeLedgerSchema.index({ referenceType: 1, referenceId: 1 });
FeeLedgerSchema.index({ school: 1, category: 1, createdAt: -1 });

module.exports = mongoose.model('FeeLedger', FeeLedgerSchema);
