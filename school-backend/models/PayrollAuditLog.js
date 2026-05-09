const mongoose = require('mongoose');

const PayrollAuditLogSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: String,
    actionType: {
        type: String,
        required: true,
        // e.g. STRUCTURE_CREATED, STRUCTURE_UPDATED, STRUCTURE_DELETED,
        // ASSIGNMENT_CREATED, ASSIGNMENT_UPDATED, ASSIGNMENT_DEACTIVATED,
        // PAYROLL_RUN, PAYROLL_REVIEWED, PAYROLL_APPROVED, PAYROLL_PUBLISHED,
        // ENTRY_UPDATED, PAYSLIP_GENERATED
    },
    entityType: {
        type: String,
        enum: ['SalaryStructure', 'EmployeeSalaryAssignment', 'PayrollRun', 'PayrollEntry', 'Payslip'],
    },
    entityId: { type: mongoose.Schema.Types.ObjectId },
    oldValue: { type: mongoose.Schema.Types.Mixed },
    newValue: { type: mongoose.Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now, index: true },
});

PayrollAuditLogSchema.index({ school: 1, timestamp: -1 });
PayrollAuditLogSchema.index({ school: 1, actionType: 1 });
PayrollAuditLogSchema.index({ school: 1, entityType: 1, entityId: 1 });

module.exports = mongoose.model('PayrollAuditLog', PayrollAuditLogSchema);
