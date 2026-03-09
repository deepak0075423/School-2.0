const mongoose = require('mongoose');

const StudentPromotionHistorySchema = new mongoose.Schema({
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    oldClass: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        default: null,
    },
    newClass: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        required: true,
    },
    oldSection: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClassSection',
        default: null,
    },
    newSection: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClassSection',
        default: null,
    },
    promotionDate: {
        type: Date,
        default: Date.now,
    },
    promotedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    academicYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AcademicYear',
        required: true,
    },
    remarks: {
        type: String,
        default: '',
    },
});

module.exports = mongoose.model('StudentPromotionHistory', StudentPromotionHistorySchema);
