const mongoose = require('mongoose');

const FeeStructureItemSchema = new mongoose.Schema({
    feeHead: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeHead', required: true },
    amount: { type: Number, required: true, min: 0 },
    dueDate: { type: Date, default: null },
    installmentLabel: { type: String, default: '', trim: true },
    isActive: { type: Boolean, default: true },
}, { _id: true });

const FeeStructureSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYear: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    name: { type: String, required: true, trim: true },
    level: { type: String, enum: ['class', 'section'], required: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', default: null },
    section: { type: mongoose.Schema.Types.ObjectId, ref: 'ClassSection', default: null },
    items: [FeeStructureItemSchema],
    totalAmount: { type: Number, default: 0 },
    demandGenerated: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

FeeStructureSchema.index({ school: 1, academicYear: 1, level: 1, class: 1 });
FeeStructureSchema.index({ school: 1, academicYear: 1, level: 1, section: 1 });
FeeStructureSchema.index({ school: 1, academicYear: 1, isActive: 1 });

module.exports = mongoose.model('FeeStructure', FeeStructureSchema);
