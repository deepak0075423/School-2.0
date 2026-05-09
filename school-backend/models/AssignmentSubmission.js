const mongoose = require('mongoose');

const FileSchema = new mongoose.Schema({
    originalName: { type: String, required: true },
    storedName:   { type: String, required: true },
    filePath:     { type: String, required: true },
    mimeType:     { type: String, required: true },
    fileSize:     { type: Number, required: true },
}, { _id: false });

const AssignmentSubmissionSchema = new mongoose.Schema({
    document: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Document',
        required: true,
    },
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    section: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClassSection',
        default: null,
    },
    files: {
        type: [FileSchema],
        default: [],
    },
    status: {
        type: String,
        enum: ['pending', 'submitted', 'late'],
        default: 'pending',
    },
    submittedAt: {
        type: Date,
        default: null,
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    reviewedAt: {
        type: Date,
        default: null,
    },
    marks: {
        type: Number,
        default: null,
    },
    feedback: {
        type: String,
        default: '',
    },
}, { timestamps: true });

AssignmentSubmissionSchema.index({ document: 1, student: 1 }, { unique: true });
AssignmentSubmissionSchema.index({ document: 1, status: 1 });
AssignmentSubmissionSchema.index({ student: 1 });

module.exports = mongoose.model('AssignmentSubmission', AssignmentSubmissionSchema);
