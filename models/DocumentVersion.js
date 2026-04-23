const mongoose = require('mongoose');

const FileSchema = new mongoose.Schema({
    originalName: { type: String, required: true },
    storedName:   { type: String, required: true },
    filePath:     { type: String, required: true },
    mimeType:     { type: String, required: true },
    fileSize:     { type: Number, required: true },
}, { _id: false });

const DocumentVersionSchema = new mongoose.Schema({
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
    versionNumber: {
        type: Number,
        required: true,
    },
    files: {
        type: [FileSchema],
        default: [],
    },
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    changeNote: {
        type: String,
        default: '',
    },
}, { timestamps: true });

DocumentVersionSchema.index({ document: 1, versionNumber: 1 });

module.exports = mongoose.model('DocumentVersion', DocumentVersionSchema);
