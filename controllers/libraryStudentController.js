const LibraryBook        = require('../models/LibraryBook');
const LibraryBookCopy    = require('../models/LibraryBookCopy');
const LibraryPolicy      = require('../models/LibraryPolicy');
const LibraryIssuance    = require('../models/LibraryIssuance');
const LibraryReservation = require('../models/LibraryReservation');
const LibraryFine        = require('../models/LibraryFine');
const LibraryAuditLog    = require('../models/LibraryAuditLog');

function libBase(req) {
    return req.session.userRole === 'teacher' ? '/library/teacher' : '/library/student';
}

async function audit(school, user, role, actionType, entityType, entityId, oldValue, newValue) {
    try {
        await LibraryAuditLog.create({ school, user, role, actionType, entityType, entityId, oldValue, newValue });
    } catch (e) {
        console.error('Library audit log failed:', e.message);
    }
}

exports.getDashboard = async (req, res) => {
    try {
        const schoolId  = req.session.schoolId;
        const userId    = req.session.userId;

        const [issuedBooks, reservations, pendingFines] = await Promise.all([
            LibraryIssuance.find({ school: schoolId, issuedTo: userId, status: { $in: ['issued', 'overdue'] } })
                .populate('book', 'title authors')
                .populate('bookCopy', 'uniqueCode')
                .sort({ dueDate: 1 }),
            LibraryReservation.find({ school: schoolId, reservedBy: userId, status: { $in: ['pending', 'ready'] } })
                .populate('book', 'title')
                .sort({ queuePosition: 1 }),
            LibraryFine.find({ school: schoolId, user: userId, status: 'pending' })
                .populate({ path: 'issuance', populate: { path: 'book', select: 'title' } }),
        ]);

        const today = new Date();
        const issuedWithStatus = issuedBooks.map(iss => {
            const msLeft = new Date(iss.dueDate) - today;
            const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
            return { ...iss.toObject(), daysLeft, _id: iss._id, book: iss.book, bookCopy: iss.bookCopy, dueDate: iss.dueDate, status: iss.status };
        });

        const base = libBase(req);
        res.render('student/library/index', {
            title: 'My Library',
            layout: 'layouts/main',
            issuedBooks: issuedWithStatus,
            reservations,
            pendingFines,
            libBase: base,
        });
    } catch (err) {
        req.flash('error', err.message);
        res.redirect(req.session.userRole === 'teacher' ? '/teacher/dashboard' : '/student/dashboard');
    }
};

exports.getSearch = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const userId   = req.session.userId;
        const { q, category, availability } = req.query;

        const filter = { school: schoolId };
        if (q) {
            const re = { $regex: q, $options: 'i' };
            filter.$or = [{ title: re }, { authors: re }, { isbn: re }, { publisher: re }];
        }
        if (category) filter.category = category;
        if (availability === 'available') filter.availableCopies = { $gt: 0 };

        const [books, categories] = await Promise.all([
            LibraryBook.find(filter).sort({ title: 1 }),
            LibraryBook.distinct('category', { school: schoolId }),
        ]);

        // Check what the user already has issued or reserved
        const [myIssuances, myReservations] = await Promise.all([
            LibraryIssuance.find({ school: schoolId, issuedTo: userId, status: { $in: ['issued', 'overdue'] } }).select('book'),
            LibraryReservation.find({ school: schoolId, reservedBy: userId, status: { $in: ['pending', 'ready'] } }).select('book'),
        ]);
        const issuedBookIds   = new Set(myIssuances.map(i => String(i.book)));
        const reservedBookIds = new Set(myReservations.map(r => String(r.book)));

        const isTeacher = req.session.userRole === 'teacher';
        res.render('student/library/search', {
            title: 'Library Search',
            layout: 'layouts/main',
            books,
            categories: categories.filter(Boolean),
            query: { q: q || '', category: category || '', availability: availability || '' },
            issuedBookIds,
            reservedBookIds,
            canReserve: !isTeacher,
            backUrl: isTeacher ? '/teacher/dashboard' : '/library/student',
        });
    } catch (err) {
        req.flash('error', err.message);
        res.redirect(req.session.userRole === 'teacher' ? '/teacher/dashboard' : '/library/student');
    }
};

exports.postReserve = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const userId   = req.session.userId;
        const { bookId } = req.params;

        const [book, policy] = await Promise.all([
            LibraryBook.findOne({ _id: bookId, school: schoolId }),
            LibraryPolicy.findOne({ school: schoolId }),
        ]);
        if (!book) { req.flash('error', 'Book not found.'); return res.redirect('/library/student/search'); }

        // Prevent reserving a book you already have issued
        const alreadyIssued = await LibraryIssuance.countDocuments({ school: schoolId, issuedTo: userId, book: bookId, status: { $in: ['issued', 'overdue'] } });
        if (alreadyIssued > 0) {
            req.flash('error', 'You already have this book issued.');
            return res.redirect('/library/student/search');
        }

        // Prevent duplicate active reservation
        const existingReservation = await LibraryReservation.findOne({ book: bookId, reservedBy: userId, status: { $in: ['pending', 'ready'] } });
        if (existingReservation) {
            req.flash('error', 'You already have an active reservation for this book.');
            return res.redirect('/library/student/search');
        }

        // Check unpaid fines
        const unpaidFines = await LibraryFine.countDocuments({ school: schoolId, user: userId, status: 'pending' });
        if (unpaidFines > 0) {
            req.flash('error', 'You have unpaid library fines. Please clear them before making a reservation.');
            return res.redirect('/library/student/search');
        }

        const queueCount = await LibraryReservation.countDocuments({ book: bookId, school: schoolId, status: { $in: ['pending', 'ready'] } });
        const reservation = await LibraryReservation.create({
            school: schoolId,
            book: bookId,
            reservedBy: userId,
            queuePosition: queueCount + 1,
        });

        await audit(schoolId, userId, req.session.userRole, 'RESERVATION_CREATED', 'Reservation', reservation._id, null, { book: book.title, queuePosition: reservation.queuePosition });
        req.flash('success', `"${book.title}" reserved. You are #${reservation.queuePosition} in queue.`);
        res.redirect('/library/student');
    } catch (err) {
        req.flash('error', err.message);
        res.redirect('/library/student/search');
    }
};

exports.postCancelReservation = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const userId   = req.session.userId;
        const reservation = await LibraryReservation.findOne({ _id: req.params.id, school: schoolId, reservedBy: userId, status: { $in: ['pending', 'ready'] } });
        if (!reservation) { req.flash('error', 'Reservation not found.'); return res.redirect('/library/student'); }

        reservation.status = 'cancelled';
        await reservation.save();

        // Reindex queue
        const active = await LibraryReservation.find({ book: reservation.book, school: schoolId, status: { $in: ['pending', 'ready'] } }).sort({ reservedAt: 1 });
        for (let i = 0; i < active.length; i++) {
            active[i].queuePosition = i + 1;
            await active[i].save();
        }

        await audit(schoolId, userId, req.session.userRole, 'RESERVATION_CANCELLED', 'Reservation', reservation._id, { status: 'pending' }, { status: 'cancelled' });
        req.flash('success', 'Reservation cancelled.');
        res.redirect('/library/student');
    } catch (err) {
        req.flash('error', err.message);
        res.redirect('/library/student');
    }
};

exports.getMyBooks = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const userId   = req.session.userId;
        const { status } = req.query;
        const filter = { school: schoolId, issuedTo: userId };
        if (status) filter.status = status;

        const issuances = await LibraryIssuance.find(filter)
            .populate('book', 'title authors category')
            .populate('bookCopy', 'uniqueCode')
            .populate('fine')
            .sort({ issueDate: -1 });

        res.render('student/library/my-books', {
            title: 'My Books',
            layout: 'layouts/main',
            issuances,
            filterStatus: status || '',
            today: new Date(),
            libBase: libBase(req),
        });
    } catch (err) {
        req.flash('error', err.message);
        res.redirect(libBase(req));
    }
};

exports.getMyFines = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const userId   = req.session.userId;

        const fines = await LibraryFine.find({ school: schoolId, user: userId })
            .populate({ path: 'issuance', populate: { path: 'book', select: 'title' } })
            .sort({ createdAt: -1 });

        const totalPending = fines.filter(f => f.status === 'pending').reduce((sum, f) => sum + f.amount, 0);

        res.render('student/library/my-fines', {
            title: 'My Library Fines',
            layout: 'layouts/main',
            fines,
            totalPending,
            libBase: libBase(req),
        });
    } catch (err) {
        req.flash('error', err.message);
        res.redirect(libBase(req));
    }
};
