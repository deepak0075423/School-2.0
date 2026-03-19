const User = require('../models/User');
const TeacherProfile = require('../models/TeacherProfile');
const StudentProfile = require('../models/StudentProfile');
const ParentProfile = require('../models/ParentProfile');

exports.getProfile = async (req, res) => {
    try {
        const userId = req.session.userId;
        const user = await User.findById(userId);
        
        if (!user) {
            req.flash('error', 'User not found.');
            return res.redirect('/');
        }

        let profileData = null;
        if (user.role === 'teacher') {
            profileData = await TeacherProfile.findOne({ user: userId });
        } else if (user.role === 'student') {
            profileData = await StudentProfile.findOne({ user: userId });
        } else if (user.role === 'parent') {
            profileData = await ParentProfile.findOne({ user: userId });
        }

        res.render('profile/index', {
            title: 'My Profile',
            layout: 'layouts/main',
            userObj: user,
            profileData: profileData || {}
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load profile.');
        res.redirect('back');
    }
};

exports.postUpdateProfile = async (req, res) => {
    try {
        const userId = req.session.userId;
        const user = await User.findById(userId);

        if (!user) {
            req.flash('error', 'User not found.');
            return res.redirect('/');
        }

        if (req.file) {
            user.profileImage = '/uploads/profiles/' + req.file.filename;
            req.session.profileImage = user.profileImage;
        }

        // Update base user details (Allow updating name and phone)
        if (req.body.name) user.name = req.body.name;
        if (req.body.phone) user.phone = req.body.phone;
        await user.save();

        if (user.role === 'teacher') {
            await TeacherProfile.findOneAndUpdate(
                { user: userId },
                {
                    gender: req.body.gender,
                    dob: req.body.dob,
                    qualification: req.body.qualification,
                    experience: req.body.experience,
                    address: req.body.address
                }
            );
        } else if (user.role === 'student') {
            await StudentProfile.findOneAndUpdate(
                { user: userId },
                {
                    gender: req.body.gender,
                    dob: req.body.dob,
                    bloodGroup: req.body.bloodGroup,
                    religion: req.body.religion,
                    address: req.body.address
                }
            );
        } else if (user.role === 'parent') {
            await ParentProfile.findOneAndUpdate(
                { user: userId },
                {
                    fatherOccupation: req.body.fatherOccupation,
                    motherOccupation: req.body.motherOccupation,
                    guardianOccupation: req.body.guardianOccupation,
                    emergencyContact: req.body.emergencyContact,
                    annualIncome: req.body.annualIncome
                }
            );
        }

        req.flash('success', 'Profile updated successfully.');
        res.redirect('/profile');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to update profile.');
        res.redirect('/profile');
    }
};
