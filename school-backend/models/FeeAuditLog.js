const mongoose = require('mongoose');

const FeeAuditLogSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    role: { type: String, default: '' },
    actionType: { type: String, required: true },
    entityType: {
        type: String,
        enum: ['FeeHead', 'FeeStructure', 'StudentFeeAssignment', 'FineRule', 'FeeConcession',
               'StudentConcession', 'FeePayment', 'FeeSettings', 'FeeLedger'],
        default: null,
    },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    oldValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue: { type: mongoose.Schema.Types.Mixed, default: null },
    timestamp: { type: Date, default: Date.now, immutable: true },
});

FeeAuditLogSchema.index({ school: 1, timestamp: -1 });
FeeAuditLogSchema.index({ school: 1, actionType: 1 });
FeeAuditLogSchema.index({ school: 1, entityType: 1, entityId: 1 });

module.exports = mongoose.model('FeeAuditLog', FeeAuditLogSchema);
