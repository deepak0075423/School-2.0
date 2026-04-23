const mongoose = require('mongoose');

const TeacherProfileSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
    },
    employeeId: {
        type: String,
        default: '',
        trim: true,
    },
    gender: {
        type: String,
        enum: ['Male', 'Female', 'Other', ''],
        default: '',
    },
    dob: {
        type: Date,
        default: null,
    },
    joiningDate: {
        type: Date,
        default: null,
    },
    designation: {
        type: String,
        enum: ['', 'Teacher', 'Senior Teacher', 'Head of Department (HOD)', 'Principal', 'Vice Principal', 'Librarian', 'Lab Assistant', 'Physical Education Teacher', 'Counselor', 'Administrator', 'Other'],
        default: '',
    },
    department: {
        type: String,
        default: '',
    },
    subjects: {
        type: [String],
        default: [],
    },
    classes: {
        type: [String],
        default: [],
    },
    qualification: {
        type: String,
        default: '',
    },
    experience: {
        type: String,
        default: '',
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('TeacherProfile', TeacherProfileSchema);
