const mongoose = require('mongoose');

const FeeCategorySchema = new mongoose.Schema({
    school:   { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    name:     { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
}, { timestamps: true });

FeeCategorySchema.index({ school: 1, name: 1 }, { unique: true });
FeeCategorySchema.index({ school: 1, isActive: 1 });

module.exports = mongoose.model('FeeCategory', FeeCategorySchema);
