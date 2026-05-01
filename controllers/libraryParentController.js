const LibraryIssuance    = require('../models/LibraryIssuance');
const LibraryReservation = require('../models/LibraryReservation');
const LibraryFine        = require('../models/LibraryFine');
const StudentProfile     = require('../models/StudentProfile');
const User               = require('../models/User');

exports.getLibraryOverview = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const parentId = req.session.userId;

        const allProfiles = await StudentProfile.find({ school: schoolId, parent: parentId })
            .populate('user', 'name email').lean();
        const children = allProfiles.filter(p => p.user);

        if (children.length === 0) {
            req.flash('error', 'No linked student found for your account.');
            return res.redirect('/parent/dashboard');
        }

        const selectedId = req.query.child || children[0].user._id.toString();
        const selected = children.find(c => c.user._id.toString() === selectedId) || children[0];
        const childId = selected.user._id;

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
            children,
            selectedChild: selected.user,
            child: selected.user,
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
