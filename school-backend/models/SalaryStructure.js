const mongoose = require('mongoose');

const ComponentSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['earning', 'deduction'], required: true },
    calculationType: { type: String, enum: ['fixed', 'percentage'], required: true },
    value: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    percentageOf: { type: String, default: 'Basic Salary', trim: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
}, { _id: true });

const SalaryStructureSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    description: { type: String, default: '' },
    components: [ComponentSchema],
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

SalaryStructureSchema.index({ school: 1, isActive: 1 });
SalaryStructureSchema.index({ school: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('SalaryStructure', SalaryStructureSchema);
