const mongoose = require('mongoose');

const SchoolSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    address: {
        type: String,
        default: '',
    },
    email: {
        type: String,
        default: '',
        lowercase: true,
    },
    phone: {
        type: String,
        default: '',
    },
    website: {
        type: String,
        default: '',
    },
    logo: {
        type: String,
        default: '',
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('School', SchoolSchema);
