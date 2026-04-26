const mongoose = require('mongoose');

const LineItemSchema = new mongoose.Schema({
    name: { type: String, required: true },
    amount: { type: Number, required: true, default: 0 },
}, { _id: false });

const PayrollEntrySchema = new mongoose.Schema({
    payrollRun: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollRun', required: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    month: { type: Number, required: true },
    year: { type: Number, required: true },
    salaryAssignment: { type: mongoose.Schema.Types.ObjectId, ref: 'EmployeeSalaryAssignment' },
    earnings: [LineItemSchema],
    deductions: [LineItemSchema],
    grossSalary: { type: Number, default: 0 },
    totalDeductions: { type: Number, default: 0 },
    netSalary: { type: Number, default: 0 },
    lopDays: { type: Number, default: 0 },
    lopAmount: { type: Number, default: 0 },
    arrears: { type: Number, default: 0 },
    bonus: { type: Number, default: 0 },
    payslip: { type: mongoose.Schema.Types.ObjectId, ref: 'Payslip', default: null },
}, { timestamps: true });

PayrollEntrySchema.index({ payrollRun: 1, employee: 1 }, { unique: true });
PayrollEntrySchema.index({ school: 1, year: -1, month: -1 });
PayrollEntrySchema.index({ employee: 1, year: -1, month: -1 });

module.exports = mongoose.model('PayrollEntry', PayrollEntrySchema);
