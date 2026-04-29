const mongoose = require('mongoose');

const FeeConcessionSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    name: { type: String, required: true, trim: true },
    concessionType: { type: String, enum: ['percentage', 'fixed'], required: true },
    value: { type: Number, required: true, min: 0 },
    applicableTo: { type: String, enum: ['all', 'specific_heads'], default: 'all' },
    applicableHeads: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FeeHead' }],
    description: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

FeeConcessionSchema.index({ school: 1, isActive: 1 });
FeeConcessionSchema.index({ school: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('FeeConcession', FeeConcessionSchema);
