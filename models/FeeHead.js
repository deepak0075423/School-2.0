const mongoose = require('mongoose');

const FeeHeadSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    name: { type: String, required: true, trim: true },
    category: {
        type: String,
        enum: ['tuition', 'transport', 'admission', 'exam', 'library', 'sports', 'hostel', 'custom'],
        default: 'custom',
    },
    type: { type: String, enum: ['recurring', 'one_time'], required: true },
    defaultAmount: { type: Number, default: 0, min: 0 },
    description: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

FeeHeadSchema.index({ school: 1, name: 1 }, { unique: true });
FeeHeadSchema.index({ school: 1, isActive: 1 });
FeeHeadSchema.index({ school: 1, category: 1 });

module.exports = mongoose.model('FeeHead', FeeHeadSchema);
