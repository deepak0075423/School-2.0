const LibraryIssuance    = require('../models/LibraryIssuance');
const LibraryReservation = require('../models/LibraryReservation');
const LibraryFine        = require('../models/LibraryFine');
const StudentProfile     = require('../models/StudentProfile');
const User               = require('../models/User');

exports.getLibraryOverview = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const parentId = req.session.userId;

        // Find linked child
        const studentProfile = await StudentProfile.findOne({ school: schoolId, parent: parentId }).populate('user', 'name email');
        if (!studentProfile || !studentProfile.user) {
            req.flash('error', 'No linked student found for your account.');
            return res.redirect('/parent/dashboard');
        }

        const childId = studentProfile.user._id;

        const [issuedBooks, reservations, fines] = await Promise.all([
            LibraryIssuance.find({ school: schoolId, issuedTo: childId })
                .populate('book', 'title authors category')
                .populate('bookCopy', 'uniqueCode')
                .sort({ issueDate: -1 })
                .limit(20),
            LibraryReservation.find({ school: schoolId, reservedBy: childId, status: { $in: ['pending', 'ready'] } })
                .populate('book', 'title')
                .sort({ queuePosition: 1 }),
            LibraryFine.find({ school: schoolId, user: childId })
                .populate({ path: 'issuance', populate: { path: 'book', select: 'title' } })
                .sort({ createdAt: -1 }),
        ]);

        const totalPendingFine = fines.filter(f => f.status === 'pending').reduce((sum, f) => sum + f.amount, 0);

        res.render('parent/library', {
            title: "Child's Library Activity",
            layout: 'layouts/main',
            child: studentProfile.user,
            issuedBooks,
            reservations,
            fines,
            totalPendingFine,
            today: new Date(),
        });
    } catch (err) {
        req.flash('error', err.message);
        res.redirect('/parent/dashboard');
    }
};
