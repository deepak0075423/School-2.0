const mongoose = require('mongoose');

const CustomItemSchema = new mongoose.Schema({
    feeHead: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeHead', required: true },
    feeName: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    dueDate: { type: Date, default: null },
    installmentLabel: { type: String, default: '' },
}, { _id: true });

// Student-level fee override — highest priority in resolution chain
const StudentFeeAssignmentSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    academicYear: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    feeStructure: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeStructure', default: null },
    useCustom: { type: Boolean, default: false },
    customItems: [CustomItemSchema],
    totalAmount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    remarks: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

StudentFeeAssignmentSchema.index({ school: 1, student: 1, academicYear: 1 }, { unique: true });

module.exports = mongoose.model('StudentFeeAssignment', StudentFeeAssignmentSchema);
