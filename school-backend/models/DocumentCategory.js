const mongoose = require('mongoose');

const DocumentCategorySchema = new mongoose.Schema({
    school:   { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    name:     { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
}, { timestamps: true });

DocumentCategorySchema.index({ school: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('DocumentCategory', DocumentCategorySchema);
