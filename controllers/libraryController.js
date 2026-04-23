const LibraryBook        = require('../models/LibraryBook');
const LibraryBookCopy    = require('../models/LibraryBookCopy');
const LibraryPolicy      = require('../models/LibraryPolicy');
const LibraryIssuance    = require('../models/LibraryIssuance');
const LibraryReservation = require('../models/LibraryReservation');
const LibraryFine        = require('../models/LibraryFine');
const LibraryAuditLog    = require('../models/LibraryAuditLog');
const User               = require('../models/User');
const TeacherProfile     = require('../models/TeacherProfile');
const StudentProfile     = require('../models/StudentProfile');
const Notification       = require('../models/Notification');
const NotificationReceipt = require('../models/NotificationReceipt');
const sseClients         = require('../utils/sseClients');

// ─── Helpers ────────────────────────────────────────────────────────────────

async function audit(school, user, role, actionType, entityType, entityId, oldValue, newValue) {
    try {
        await LibraryAuditLog.create({ school, user, role, actionType, entityType, entityId, oldValue, newValue });
    } catch (e) {
        console.error('Library audit log failed:', e.message);
    }
}

async function notify(schoolId, senderUserId, senderRole, title, body, recipientIds) {
    try {
        const ids = [...new Set(recipientIds.map(id => id.toString()).filter(Boolean))];
        if (ids.length === 0) return;
        const notif = await Notification.create({
            title, body,
            sender: senderUserId,
            senderRole,
            school: schoolId,
            channels: { inApp: true, email: false },
            target: { type: 'individual', schools: [] },
            recipientCount: ids.length,
        });
        await NotificationReceipt.insertMany(
            ids.map(rid => ({ notification: notif._id, recipient: rid, school: schoolId })),
            { ordered: false }
        );
        sseClients.pushMany(ids, 'notification', { title, body, senderRole, createdAt: notif.createdAt });
    } catch (e) {
        console.error('[Library] Notification failed:', e.message);
    }
}

async function getParentId(schoolId, studentUserId) {
    const profile = await StudentProfile.findOne({ school: schoolId, user: studentUserId }).select('parent');
    return profile?.parent ? profile.parent.toString() : null;
}

async function getOrCreatePolicy(schoolId) {
    let policy = await LibraryPolicy.findOne({ school: schoolId });
    if (!policy) policy = await LibraryPolicy.create({ school: schoolId });
    return policy;
}

async function nextCopyCode(schoolId) {
    const policy = await LibraryPolicy.findOneAndUpdate(
        { school: schoolId },
        { $inc: { lastCopySequence: 1 } },
        { new: true, upsert: true }
    );
    return `LIB-COPY-${String(policy.lastCopySequence).padStart(6, '0')}`;
}

function calcFine(dueDate, returnDate, finePerDay, gracePeriodDays) {
    const due = new Date(dueDate);
    const ret = new Date(returnDate);
    due.setHours(0, 0, 0, 0);
    ret.setHours(0, 0, 0, 0);
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysLate = Math.floor((ret - due) / msPerDay) - gracePeriodDays;
    return daysLate > 0 ? { daysLate, amount: daysLate * finePerDay } : { daysLate: 0, amount: 0 };
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

exports.getDashboard = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const [
            totalBooks,
            totalCopies,
            availableCopies,
            activeIssuances,
            overdueIssuances,
            pendingFines,
            pendingReservations,
            recentIssuances,
        ] = await Promise.all([
            LibraryBook.countDocuments({ school: schoolId }),
            LibraryBookCopy.countDocuments({ school: schoolId }),
            LibraryBookCopy.countDocuments({ school: schoolId, status: 'available' }),
            LibraryIssuance.countDocuments({ school: schoolId, status: 'issued' }),
            LibraryIssuance.countDocuments({ school: schoolId, status: 'overdue' }),
            LibraryFine.countDocuments({ school: schoolId, status: 'pending' }),
            LibraryReservation.countDocuments({ school: schoolId, status: 'pending' }),
            LibraryIssuance.find({ school: schoolId, status: { $in: ['issued', 'overdue'] } })
                .populate('issuedTo', 'name')
                .populate('book', 'title')
                .populate('bookCopy', 'uniqueCode')
                .sort({ issueDate: -1 })
                .limit(10),
        ]);

        res.render('library/dashboard', {
            title: 'Library Dashboard',
            layout: 'layouts/main',
            stats: { totalBooks, totalCopies, availableCopies, activeIssuances, overdueIssuances, pendingFines, pendingReservations },
            recentIssuances,
        });
    } catch (err) {
        req.flash('error', err.message);
        res.redirect('/admin/dashboard');
    }
};

// ─── Books ───────────────────────────────────────────────────────────────────

exports.getBooks = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const { q, category, availability } = req.query;
        const filter = { school: schoolId };
        if (q) filter.title = { $regex: q, $options: 'i' };
        if (category) filter.category = category;
        if (availability === 'available') filter.availableCopies = { $gt: 0 };
        if (availability === 'unavailable') filter.availableCopies = 0;

        const [books, categories] = await Promise.all([
            LibraryBook.find(filter).sort({ title: 1 }),
            LibraryBook.distinct('category', { school: schoolId }),
        ]);

        res.render('library/books/index', {
            title: 'Library — Books',
            layout: 'layouts/main',
            books,
            categories: categories.filter(Boolean),
            query: { q: q || '', category: category || '', availability: availability || '' },
        });
    } catch (err) {
        req.flash('error', err.message);
        res.redirect('/library/dashboard');
    }
};

exports.getCreateBook = (req, res) => {
    res.render('library/books/create', {
        title: 'Add Book',
        layout: 'layouts/main',
    });
};

exports.postCreateBook = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const { title, isbn, authors, publisher, category, edition, language, description } = req.body;
        if (!title) {
            req.flash('error', 'Book title is required.');
            return res.redirect('/library/books/create');
        }
        const authorsArr = authors ? authors.split(',').map(a => a.trim()).filter(Boolean) : [];
        const book = await LibraryBook.create({
            school: schoolId,
            title: title.trim(),
            isbn: isbn || '',
            authors: authorsArr,
            publisher: publisher || '',
            category: category || '',
            edition: edition || '',
            language: language || 'English',
            description: description || '',
            createdBy: req.session.userId,
        });
        await audit(schoolId, req.session.userId, req.session.userRole, 'BOOK_CREATED', 'Book', book._id, null, { title: book.title, isbn: book.isbn });
        req.flash('success', `Book "${book.title}" added to the library.`);
        res.redirect(`/library/books/${book._id}`);
    } catch (err) {
        req.flash('error', err.message);
        res.redirect('/library/books/create');
    }
};

exports.getBookDetail = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const book = await LibraryBook.findOne({ _id: req.params.id, school: schoolId });
        if (!book) {
            req.flash('error', 'Book not found.');
            return res.redirect('/library/books');
        }
        const copies = await LibraryBookCopy.find({ book: book._id, school: schoolId }).sort({ uniqueCode: 1 });
        const activeIssuances = await LibraryIssuance.find({ book: book._id, school: schoolId, status: { $in: ['issued', 'overdue'] } })
            .populate('issuedTo', 'name')
            .populate('bookCopy', 'uniqueCode')
            .sort({ issueDate: -1 });
        const reservationQueue = await LibraryReservation.find({ book: book._id, school: schoolId, status: { $in: ['pending', 'ready'] } })
            .populate('reservedBy', 'name')
            .sort({ queuePosition: 1 });

        res.render('library/books/detail', {
            title: book.title,
            layout: 'layouts/main',
            book,
            copies,
            activeIssuances,
            reservationQueue,
        });
    } catch (err) {
        req.flash('error', err.message);
        res.redirect('/library/books');
    }
};

exports.getEditBook = async (req, res) => {
    try {
        const book = await LibraryBook.findOne({ _id: req.params.id, school: req.session.schoolId });
        if (!book) { req.flash('error', 'Book not found.'); return res.redirect('/library/books'); }
        res.render('library/books/edit', { title: `Edit: ${book.title}`, layout: 'layouts/main', book });
    } catch (err) {
        req.flash('error', err.message);
        res.redirect('/library/books');
    }
};

exports.postEditBook = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const book = await LibraryBook.findOne({ _id: req.params.id, school: schoolId });
        if (!book) { req.flash('error', 'Book not found.'); return res.redirect('/library/books'); }

        const oldValue = { title: book.title, isbn: book.isbn, category: book.category };
        const authorsArr = req.body.authors ? req.body.authors.split(',').map(a => a.trim()).filter(Boolean) : [];
        book.title       = req.body.title ? req.body.title.trim() : book.title;
        book.isbn        = req.body.isbn || '';
        book.authors     = authorsArr;
        book.publisher   = req.body.publisher || '';
        book.category    = req.body.category || '';
        book.edition     = req.body.edition || '';
        book.language    = req.body.language || 'English';
        book.description = req.body.description || '';
        await book.save();

        await audit(schoolId, req.session.userId, req.session.userRole, 'BOOK_UPDATED', 'Book', book._id, oldValue, { title: book.title, isbn: book.isbn, category: book.category });
        req.flash('success', 'Book updated.');
        res.redirect(`/library/books/${book._id}`);
    } catch (err) {
        req.flash('error', err.message);
        res.redirect(`/library/books/${req.params.id}/edit`);
    }
};

exports.postDeleteBook = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const book = await LibraryBook.findOne({ _id: req.params.id, school: schoolId });
        if (!book) { req.flash('error', 'Book not found.'); return res.redirect('/library/books'); }

        const activeCount = await LibraryIssuance.countDocuments({ book: book._id, status: { $in: ['issued', 'overdue'] } });
        if (activeCount > 0) {
            req.flash('error', 'Cannot delete a book with active issuances. Return all copies first.');
            return res.redirect(`/library/books/${book._id}`);
        }
        await LibraryBookCopy.deleteMany({ book: book._id });
        await audit(schoolId, req.session.userId, req.session.userRole, 'BOOK_DELETED', 'Book', book._id, { title: book.title }, null);
        await book.deleteOne();
        req.flash('success', `Book "${book.title}" deleted.`);
        res.redirect('/library/books');
    } catch (err) {
        req.flash('error', err.message);
        res.redirect('/library/books');
    }
};

// ─── Book Copies ─────────────────────────────────────────────────────────────

exports.postAddCopy = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const book = await LibraryBook.findOne({ _id: req.params.id, school: schoolId });
        if (!book) { req.flash('error', 'Book not found.'); return res.redirect('/library/books'); }

        const { condition, rackLocation, acquisitionDate } = req.body;
        const uniqueCode = await nextCopyCode(schoolId);

        const copy = await LibraryBookCopy.create({
            school: schoolId,
            book: book._id,
            uniqueCode,
            condition: condition || 'new',
            rackLocation: rackLocation || '',
            acquisitionDate: acquisitionDate ? new Date(acquisitionDate) : null,
            addedBy: req.session.userId,
        });

        // Keep denormalized counts in sync
        book.totalCopies += 1;
        book.availableCopies += 1;
        await book.save();

        await audit(schoolId, req.session.userId, req.session.userRole, 'COPY_ADDED', 'BookCopy', copy._id, null, { uniqueCode, book: book.title });
        req.flash('success', `Copy ${uniqueCode} added.`);
        res.redirect(`/library/books/${book._id}`);
    } catch (err) {
        req.flash('error', err.message);
        res.redirect(`/library/books/${req.params.id}`);
    }
};

exports.postEditCopy = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const copy = await LibraryBookCopy.findOne({ _id: req.params.copyId, school: schoolId });
        if (!copy) { req.flash('error', 'Copy not found.'); return res.redirect(`/library/books/${req.params.id}`); }

        const oldValue = { condition: copy.condition, rackLocation: copy.rackLocation, status: copy.status };
        copy.condition    = req.body.condition || copy.condition;
        copy.rackLocation = req.body.rackLocation || '';
        if (req.body.acquisitionDate) copy.acquisitionDate = new Date(req.body.acquisitionDate);
        await copy.save();

        await audit(schoolId, req.session.userId, req.session.userRole, 'COPY_UPDATED', 'BookCopy', copy._id, oldValue, { condition: copy.condition, rackLocation: copy.rackLocation });
        req.flash('success', `Copy ${copy.uniqueCode} updated.`);
        res.redirect(`/library/books/${req.params.id}`);
    } catch (err) {
        req.flash('error', err.message);
        res.redirect(`/library/books/${req.params.id}`);
    }
};

exports.postMarkCopyLostOrDamaged = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const { status } = req.body; // 'lost' or 'damaged'
        if (!['lost', 'damaged'].includes(status)) {
            req.flash('error', 'Invalid status.');
            return res.redirect(`/library/books/${req.params.id}`);
        }

        const copy = await LibraryBookCopy.findOne({ _id: req.params.copyId, school: schoolId });
        if (!copy) { req.flash('error', 'Copy not found.'); return res.redirect(`/library/books/${req.params.id}`); }

        const oldStatus = copy.status;
        const wasAvailable = copy.status === 'available';
        copy.status = status;
        await copy.save();

        // Adjust available count
        if (wasAvailable) {
            await LibraryBook.findByIdAndUpdate(req.params.id, { $inc: { availableCopies: -1 } });
        }

        await audit(schoolId, req.session.userId, req.session.userRole, 'COPY_STATUS_CHANGED', 'BookCopy', copy._id, { status: oldStatus }, { status });
        req.flash('success', `Copy ${copy.uniqueCode} marked as ${status}.`);
        res.redirect(`/library/books/${req.params.id}`);
    } catch (err) {
        req.flash('error', err.message);
        res.redirect(`/library/books/${req.params.id}`);
    }
};

// ─── Circulation: Issue ───────────────────────────────────────────────────────

exports.getIssueForm = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const students = await User.find({ school: schoolId, role: 'student', isActive: true }).select('name email').sort({ name: 1 });
        const teachers = await User.find({ school: schoolId, role: 'teacher', isActive: true }).select('name email').sort({ name: 1 });
        const books    = await LibraryBook.find({ school: schoolId, availableCopies: { $gt: 0 } }).sort({ title: 1 });

        res.render('library/circulation/issue', {
            title: 'Issue Book',
            layout: 'layouts/main',
            students,
            teachers,
            books,
            prefillUserId:  req.query.userId  || '',
            prefillBookId:  req.query.bookId  || '',
        });
    } catch (err) {
        req.flash('error', err.message);
        res.redirect('/library/dashboard');
    }
};

exports.postIssueBook = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const { userId, bookId, notes } = req.body;

        if (!userId || !bookId) {
            req.flash('error', 'User and book are required.');
            return res.redirect('/library/issue');
        }

        const [user, book, policy] = await Promise.all([
            User.findOne({ _id: userId, school: schoolId }),
            LibraryBook.findOne({ _id: bookId, school: schoolId }),
            getOrCreatePolicy(schoolId),
        ]);

        if (!user || !book) { req.flash('error', 'User or book not found.'); return res.redirect('/library/issue'); }

        // Validate: unpaid fines
        const unpaidFines = await LibraryFine.countDocuments({ school: schoolId, user: userId, status: 'pending' });
        if (unpaidFines > 0) {
            req.flash('error', `${user.name} has ${unpaidFines} unpaid fine(s). Clear fines before issuing.`);
            return res.redirect('/library/issue');
        }

        // Validate: max books limit
        const currentIssued = await LibraryIssuance.countDocuments({ school: schoolId, issuedTo: userId, status: { $in: ['issued', 'overdue'] } });
        if (currentIssued >= policy.maxBooksPerUser) {
            req.flash('error', `${user.name} already has ${currentIssued} book(s) issued (max: ${policy.maxBooksPerUser}).`);
            return res.redirect('/library/issue');
        }

        // Validate: not already issued same book
        const alreadyHasBook = await LibraryIssuance.countDocuments({ school: schoolId, issuedTo: userId, book: bookId, status: { $in: ['issued', 'overdue'] } });
        if (alreadyHasBook > 0) {
            req.flash('error', `${user.name} already has this book issued.`);
            return res.redirect('/library/issue');
        }

        // Atomically grab an available copy (race-condition safe)
        const copy = await LibraryBookCopy.findOneAndUpdate(
            { book: bookId, school: schoolId, status: 'available' },
            { $set: { status: 'issued' } },
            { new: true }
        );
        if (!copy) {
            req.flash('error', 'No available copies at the moment. Ask the student to reserve instead.');
            return res.redirect('/library/issue');
        }

        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + policy.issueDurationDays);

        const issuance = await LibraryIssuance.create({
            school: schoolId,
            book: bookId,
            bookCopy: copy._id,
            issuedTo: userId,
            issuedToRole: user.role,
            issuedBy: req.session.userId,
            dueDate,
            notes: notes || '',
        });

        // Decrement available count
        await LibraryBook.findByIdAndUpdate(bookId, { $inc: { availableCopies: -1 } });

        // If user had a reservation for this book, mark it collected
        await LibraryReservation.findOneAndUpdate(
            { book: bookId, reservedBy: userId, status: { $in: ['pending', 'ready'] } },
            { $set: { status: 'collected' } }
        );
        // Recompute queue positions for remaining reservations
        await reindexQueue(bookId, schoolId);

        await audit(schoolId, req.session.userId, req.session.userRole, 'BOOK_ISSUED', 'Issuance', issuance._id, null, { user: user.name, book: book.title, copy: copy.uniqueCode, dueDate });
        await notify(schoolId, req.session.userId, req.session.userRole,
            '📚 Book Issued',
            `"${book.title}" has been issued to you (copy: ${copy.uniqueCode}). Please return it by ${dueDate.toDateString()}.`,
            [userId]
        );
        req.flash('success', `"${book.title}" (${copy.uniqueCode}) issued to ${user.name}. Due: ${dueDate.toDateString()}.`);
        res.redirect('/library/issuances');
    } catch (err) {
        req.flash('error', err.message);
        res.redirect('/library/issue');
    }
};

// ─── Circulation: Return ──────────────────────────────────────────────────────

exports.getReturnForm = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const activeIssuances = await LibraryIssuance.find({ school: schoolId, status: { $in: ['issued', 'overdue'] } })
            .populate('issuedTo', 'name email')
            .populate('book', 'title')
            .populate('bookCopy', 'uniqueCode')
            .sort({ dueDate: 1 });

        res.render('library/circulation/return', {
            title: 'Return Book',
            layout: 'layouts/main',
            activeIssuances,
            prefillId: req.query.id || '',
        });
    } catch (err) {
        req.flash('error', err.message);
        res.redirect('/library/dashboard');
    }
};

exports.postReturnBook = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const { issuanceId, condition, lostOrDamaged } = req.body;

        const issuance = await LibraryIssuance.findOne({ _id: issuanceId, school: schoolId, status: { $in: ['issued', 'overdue'] } })
            .populate('issuedTo', 'name')
            .populate('book', 'title')
            .populate('bookCopy');
        if (!issuance) { req.flash('error', 'Issuance not found or already returned.'); return res.redirect('/library/return'); }

        const policy = await getOrCreatePolicy(schoolId);
        const returnDate = new Date();
        let fineRecord = null;

        if (lostOrDamaged === 'lost') {
            // Mark copy as lost, charge a fixed fine (admin sets via policy — use 10x daily rate as default)
            issuance.bookCopy.status = 'damaged'; // will be overridden
            await LibraryBookCopy.findByIdAndUpdate(issuance.bookCopy._id, { $set: { status: 'lost' } });
            issuance.status = 'lost';
            issuance.returnDate = returnDate;

            const lostAmount = policy.finePerDay * 30; // 30-day equivalent as lost book penalty
            fineRecord = await LibraryFine.create({
                school: schoolId,
                issuance: issuance._id,
                user: issuance.issuedTo._id,
                fineType: 'lost',
                amount: lostAmount,
                daysOverdue: 0,
            });
        } else if (lostOrDamaged === 'damaged') {
            await LibraryBookCopy.findByIdAndUpdate(issuance.bookCopy._id, { $set: { status: 'damaged', condition: 'damaged' } });
            issuance.status = 'returned';
            issuance.returnDate = returnDate;

            const { daysLate, amount } = calcFine(issuance.dueDate, returnDate, policy.finePerDay, policy.gracePeriodDays);
            const damageAmount = policy.finePerDay * 10; // flat damage penalty
            const totalAmount = amount + damageAmount;
            if (totalAmount > 0) {
                fineRecord = await LibraryFine.create({
                    school: schoolId,
                    issuance: issuance._id,
                    user: issuance.issuedTo._id,
                    fineType: 'damaged',
                    amount: totalAmount,
                    daysOverdue: daysLate,
                });
            }
            // copy is damaged — don't restore to available
        } else {
            // Normal return
            const newStatus = condition === 'damaged' ? 'damaged' : 'available';
            await LibraryBookCopy.findByIdAndUpdate(issuance.bookCopy._id, {
                $set: { status: newStatus, condition: condition || issuance.bookCopy.condition }
            });

            if (newStatus === 'available') {
                await LibraryBook.findByIdAndUpdate(issuance.book._id, { $inc: { availableCopies: 1 } });
            }

            const { daysLate, amount } = calcFine(issuance.dueDate, returnDate, policy.finePerDay, policy.gracePeriodDays);
            issuance.status = 'returned';
            issuance.returnDate = returnDate;

            if (amount > 0) {
                fineRecord = await LibraryFine.create({
                    school: schoolId,
                    issuance: issuance._id,
                    user: issuance.issuedTo._id,
                    fineType: 'late_return',
                    amount,
                    daysOverdue: daysLate,
                });
            }
        }

        if (fineRecord) {
            issuance.fine = fineRecord._id;
            await audit(schoolId, req.session.userId, req.session.userRole, 'FINE_GENERATED', 'Fine', fineRecord._id, null, { amount: fineRecord.amount, type: fineRecord.fineType, user: issuance.issuedTo.name });
            const fineRecipients = [issuance.issuedTo._id.toString()];
            if (issuance.issuedToRole === 'student') {
                const parentId = await getParentId(schoolId, issuance.issuedTo._id);
                if (parentId) fineRecipients.push(parentId);
            }
            await notify(schoolId, req.session.userId, req.session.userRole,
                '⚠️ Library Fine Generated',
                `A ₹${fineRecord.amount.toFixed(2)} fine has been raised for "${issuance.book.title}" (${fineRecord.fineType.replace('_', ' ')}). Please visit the library to clear it.`,
                fineRecipients
            );
        }
        await issuance.save();

        // Notify next in reservation queue if a copy became available
        if (!lostOrDamaged && condition !== 'damaged') {
            await notifyNextReservation(issuance.book._id || issuance.book, schoolId, policy);
        }

        await audit(schoolId, req.session.userId, req.session.userRole, 'BOOK_RETURNED', 'Issuance', issuance._id,
            { status: 'issued' },
            { status: issuance.status, returnDate, fine: fineRecord ? fineRecord.amount : 0 }
        );
        const fineMsg = fineRecord ? ` Fine of ₹${fineRecord.amount} generated.` : '';
        req.flash('success', `Book returned from ${issuance.issuedTo.name}.${fineMsg}`);
        res.redirect('/library/issuances');
    } catch (err) {
        req.flash('error', err.message);
        res.redirect('/library/return');
    }
};

// ─── Circulation: Renew ───────────────────────────────────────────────────────

exports.postRenewBook = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const issuance = await LibraryIssuance.findOne({ _id: req.params.id, school: schoolId, status: { $in: ['issued', 'overdue'] } })
            .populate('issuedTo', 'name')
            .populate('book', 'title');
        if (!issuance) { req.flash('error', 'Active issuance not found.'); return res.redirect('/library/issuances'); }

        const policy = await getOrCreatePolicy(schoolId);

        if (issuance.renewalCount >= policy.maxRenewals) {
            req.flash('error', `Max renewals (${policy.maxRenewals}) reached for this issuance.`);
            return res.redirect('/library/issuances');
        }

        const activeReservations = await LibraryReservation.countDocuments({
            book: issuance.book._id,
            school: schoolId,
            status: 'pending',
        });
        if (activeReservations > 0) {
            req.flash('error', `Cannot renew — ${activeReservations} reservation(s) are waiting for this book.`);
            return res.redirect('/library/issuances');
        }

        const oldDue = new Date(issuance.dueDate);
        const newDue = new Date();
        newDue.setDate(newDue.getDate() + policy.issueDurationDays);
        issuance.dueDate = newDue;
        issuance.renewalCount += 1;
        issuance.status = 'issued';
        await issuance.save();

        await audit(schoolId, req.session.userId, req.session.userRole, 'BOOK_RENEWED', 'Issuance', issuance._id,
            { dueDate: oldDue, renewalCount: issuance.renewalCount - 1 },
            { dueDate: newDue, renewalCount: issuance.renewalCount }
        );
        await notify(schoolId, req.session.userId, req.session.userRole,
            '🔄 Book Renewed',
            `"${issuance.book.title}" has been renewed for you. New due date: ${newDue.toDateString()}.`,
            [issuance.issuedTo._id.toString()]
        );
        req.flash('success', `"${issuance.book.title}" renewed for ${issuance.issuedTo.name}. New due: ${newDue.toDateString()}.`);
        res.redirect('/library/issuances');
    } catch (err) {
        req.flash('error', err.message);
        res.redirect('/library/issuances');
    }
};

// ─── Issuances List ───────────────────────────────────────────────────────────

exports.getIssuances = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const { status, q } = req.query;

        // Auto-mark overdue issuances on page load
        await LibraryIssuance.updateMany(
            { school: schoolId, status: 'issued', dueDate: { $lt: new Date() } },
            { $set: { status: 'overdue' } }
        );

        const filter = { school: schoolId };
        if (status) filter.status = status;
        else filter.status = { $in: ['issued', 'overdue'] };

        let issuances = await LibraryIssuance.find(filter)
            .populate('issuedTo', 'name email')
            .populate('book', 'title')
            .populate('bookCopy', 'uniqueCode')
            .sort({ dueDate: 1 });

        if (q) {
            const re = new RegExp(q, 'i');
            issuances = issuances.filter(i =>
                re.test(i.issuedTo?.name) || re.test(i.book?.title) || re.test(i.bookCopy?.uniqueCode)
            );
        }

        res.render('library/circulation/issuances', {
            title: 'Active Issuances',
            layout: 'layouts/main',
            issuances,
            filterStatus: status || '',
            query: q || '',
        });
    } catch (err) {
        req.flash('error', err.message);
        res.redirect('/library/dashboard');
    }
};

// ─── Reservations ─────────────────────────────────────────────────────────────

exports.getReservations = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;

        // Auto-expire reservations past their expiry date
        await LibraryReservation.updateMany(
            { school: schoolId, status: 'ready', expiresAt: { $lt: new Date() } },
            { $set: { status: 'expired' } }
        );

        const { status } = req.query;
        const filter = { school: schoolId, status: status || { $in: ['pending', 'ready'] } };

        const reservations = await LibraryReservation.find(filter)
            .populate('reservedBy', 'name email')
            .populate('book', 'title availableCopies')
            .sort({ reservedAt: 1 });

        res.render('library/reservations/index', {
            title: 'Reservations',
            layout: 'layouts/main',
            reservations,
            filterStatus: status || '',
        });
    } catch (err) {
        req.flash('error', err.message);
        res.redirect('/library/dashboard');
    }
};

exports.postMarkReservationReady = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const reservation = await LibraryReservation.findOne({ _id: req.params.id, school: schoolId, status: 'pending' })
            .populate('reservedBy', 'name')
            .populate('book', 'title availableCopies');
        if (!reservation) { req.flash('error', 'Reservation not found.'); return res.redirect('/library/reservations'); }

        if (reservation.book.availableCopies < 1) {
            req.flash('error', 'No available copies to assign for this reservation.');
            return res.redirect('/library/reservations');
        }

        const policy = await getOrCreatePolicy(schoolId);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + policy.reservationExpiryDays);

        reservation.status     = 'ready';
        reservation.readyAt    = new Date();
        reservation.expiresAt  = expiresAt;
        reservation.notifiedAt = new Date();
        await reservation.save();

        await audit(schoolId, req.session.userId, req.session.userRole, 'RESERVATION_READY', 'Reservation', reservation._id, { status: 'pending' }, { status: 'ready', expiresAt });
        await notify(schoolId, req.session.userId, req.session.userRole,
            '🔖 Book Ready for Pickup',
            `"${reservation.book.title}" is ready for you to collect from the library. Please pick it up by ${expiresAt.toDateString()} or your reservation will expire.`,
            [reservation.reservedBy._id.toString()]
        );
        req.flash('success', `${reservation.reservedBy.name} notified — must collect "${reservation.book.title}" by ${expiresAt.toDateString()}.`);
        res.redirect('/library/reservations');
    } catch (err) {
        req.flash('error', err.message);
        res.redirect('/library/reservations');
    }
};

exports.postCancelReservation = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const reservation = await LibraryReservation.findOne({ _id: req.params.id, school: schoolId, status: { $in: ['pending', 'ready'] } })
            .populate('reservedBy', 'name')
            .populate('book', 'title');
        if (!reservation) { req.flash('error', 'Reservation not found.'); return res.redirect('/library/reservations'); }

        reservation.status = 'cancelled';
        await reservation.save();
        await reindexQueue(reservation.book._id, schoolId);

        await audit(schoolId, req.session.userId, req.session.userRole, 'RESERVATION_CANCELLED', 'Reservation', reservation._id, { status: 'pending' }, { status: 'cancelled' });
        await notify(schoolId, req.session.userId, req.session.userRole,
            '❌ Reservation Cancelled',
            `Your reservation for "${reservation.book.title}" has been cancelled by the library.`,
            [reservation.reservedBy._id.toString()]
        );
        req.flash('success', 'Reservation cancelled.');
        res.redirect('/library/reservations');
    } catch (err) {
        req.flash('error', err.message);
        res.redirect('/library/reservations');
    }
};

// ─── Fines ────────────────────────────────────────────────────────────────────

exports.getFines = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const { status } = req.query;
        const filter = { school: schoolId };
        if (status) filter.status = status;

        const fines = await LibraryFine.find(filter)
            .populate('user', 'name email')
            .populate({ path: 'issuance', populate: { path: 'book', select: 'title' } })
            .sort({ createdAt: -1 });

        const totals = {
            pending: await LibraryFine.aggregate([{ $match: { school: schoolId, status: 'pending' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
            paid: await LibraryFine.aggregate([{ $match: { school: schoolId, status: 'paid' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        };

        res.render('library/fines/index', {
            title: 'Library Fines',
            layout: 'layouts/main',
            fines,
            filterStatus: status || '',
            pendingTotal: totals.pending[0]?.total || 0,
            paidTotal: totals.paid[0]?.total || 0,
        });
    } catch (err) {
        req.flash('error', err.message);
        res.redirect('/library/dashboard');
    }
};

exports.postCollectFine = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const fine = await LibraryFine.findOne({ _id: req.params.id, school: schoolId, status: 'pending' })
            .populate('user', 'name');
        if (!fine) { req.flash('error', 'Fine not found.'); return res.redirect('/library/fines'); }

        fine.status      = 'paid';
        fine.paidAt      = new Date();
        fine.collectedBy = req.session.userId;
        await fine.save();

        await audit(schoolId, req.session.userId, req.session.userRole, 'FINE_PAID', 'Fine', fine._id, { status: 'pending' }, { status: 'paid', amount: fine.amount, paidAt: fine.paidAt });
        req.flash('success', `Fine of ₹${fine.amount} collected from ${fine.user.name}.`);
        res.redirect('/library/fines');
    } catch (err) {
        req.flash('error', err.message);
        res.redirect('/library/fines');
    }
};

exports.postWaiveFine = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const fine = await LibraryFine.findOne({ _id: req.params.id, school: schoolId, status: 'pending' })
            .populate('user', 'name');
        if (!fine) { req.flash('error', 'Fine not found.'); return res.redirect('/library/fines'); }

        fine.status       = 'waived';
        fine.waivedBy     = req.session.userId;
        fine.waiverReason = req.body.reason || '';
        await fine.save();

        await audit(schoolId, req.session.userId, req.session.userRole, 'FINE_WAIVED', 'Fine', fine._id, { status: 'pending', amount: fine.amount }, { status: 'waived', reason: fine.waiverReason });
        await notify(schoolId, req.session.userId, req.session.userRole,
            '✅ Library Fine Waived',
            `Your library fine of ₹${fine.amount.toFixed(2)} has been waived. Reason: ${fine.waiverReason || 'Not specified'}.`,
            [fine.user._id.toString()]
        );
        req.flash('success', `Fine waived for ${fine.user.name}.`);
        res.redirect('/library/fines');
    } catch (err) {
        req.flash('error', err.message);
        res.redirect('/library/fines');
    }
};

// ─── Policy ───────────────────────────────────────────────────────────────────

exports.getPolicy = async (req, res) => {
    try {
        const policy = await getOrCreatePolicy(req.session.schoolId);
        res.render('library/policy', {
            title: 'Library Policy',
            layout: 'layouts/main',
            policy,
        });
    } catch (err) {
        req.flash('error', err.message);
        res.redirect('/library/dashboard');
    }
};

exports.postPolicy = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const policy = await getOrCreatePolicy(schoolId);
        const oldValue = {
            maxBooksPerUser: policy.maxBooksPerUser,
            issueDurationDays: policy.issueDurationDays,
            finePerDay: policy.finePerDay,
        };

        policy.maxBooksPerUser     = parseInt(req.body.maxBooksPerUser) || 3;
        policy.issueDurationDays   = parseInt(req.body.issueDurationDays) || 14;
        policy.finePerDay          = parseFloat(req.body.finePerDay) || 2;
        policy.gracePeriodDays     = parseInt(req.body.gracePeriodDays) || 0;
        policy.maxRenewals         = parseInt(req.body.maxRenewals) || 1;
        policy.reservationExpiryDays = parseInt(req.body.reservationExpiryDays) || 2;
        policy.teacherFinesEnabled = req.body.teacherFinesEnabled === 'on';
        policy.updatedBy           = req.session.userId;
        policy.updatedAt           = new Date();
        await policy.save();

        await audit(schoolId, req.session.userId, req.session.userRole, 'POLICY_UPDATED', 'Policy', policy._id, oldValue, {
            maxBooksPerUser: policy.maxBooksPerUser,
            issueDurationDays: policy.issueDurationDays,
            finePerDay: policy.finePerDay,
        });
        req.flash('success', 'Library policy updated.');
        res.redirect('/library/policy');
    } catch (err) {
        req.flash('error', err.message);
        res.redirect('/library/policy');
    }
};

// ─── Audit Log ────────────────────────────────────────────────────────────────

exports.getAuditLog = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const { actionType, entityType, page = 1 } = req.query;
        const limit = 50;
        const skip = (parseInt(page) - 1) * limit;

        const filter = { school: schoolId };
        if (actionType) filter.actionType = actionType;
        if (entityType) filter.entityType = entityType;

        const [logs, total] = await Promise.all([
            LibraryAuditLog.find(filter)
                .populate('user', 'name role')
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(limit),
            LibraryAuditLog.countDocuments(filter),
        ]);

        res.render('library/audit-log', {
            title: 'Library Audit Log',
            layout: 'layouts/main',
            logs,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / limit),
            filterAction: actionType || '',
            filterEntity: entityType || '',
        });
    } catch (err) {
        req.flash('error', err.message);
        res.redirect('/library/dashboard');
    }
};

// ─── Private helpers ──────────────────────────────────────────────────────────

async function reindexQueue(bookId, schoolId) {
    const active = await LibraryReservation.find({ book: bookId, school: schoolId, status: { $in: ['pending', 'ready'] } }).sort({ reservedAt: 1 });
    for (let i = 0; i < active.length; i++) {
        if (active[i].queuePosition !== i + 1) {
            active[i].queuePosition = i + 1;
            await active[i].save();
        }
    }
}

async function notifyNextReservation(bookId, schoolId, policy) {
    const next = await LibraryReservation.findOne({ book: bookId, school: schoolId, status: 'pending' })
        .sort({ queuePosition: 1 })
        .populate('reservedBy', 'name');
    if (!next) return;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + policy.reservationExpiryDays);
    next.status     = 'ready';
    next.readyAt    = new Date();
    next.expiresAt  = expiresAt;
    next.notifiedAt = new Date();
    await next.save();
}
