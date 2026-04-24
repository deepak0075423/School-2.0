const express        = require('express');
const router         = express.Router();
const multer         = require('multer');
const { isAuthenticated, requireRole, requirePasswordReset } = require('../middleware/auth');
const requireModule  = require('../middleware/requireModule');
const TeacherProfile = require('../models/TeacherProfile');
const libCtrl        = require('../controllers/libraryController');
const stuCtrl        = require('../controllers/libraryStudentController');
const parCtrl        = require('../controllers/libraryParentController');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter(req, file, cb) {
        const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname);
        cb(ok ? null : new Error('Only .xlsx, .xls, or .csv files are allowed.'), ok);
    },
});

// ─── Middleware helpers ────────────────────────────────────────────────────────

const baseGuard = [isAuthenticated, requirePasswordReset, requireModule('library')];

// Admin OR teacher with Librarian designation
const librarianGuard = [
    ...baseGuard,
    async (req, res, next) => {
        const role = req.session.userRole;
        if (role === 'school_admin') return next();
        if (role === 'teacher') {
            const profile = await TeacherProfile.findOne({ user: req.session.userId });
            if (profile && profile.designation === 'Librarian') return next();
        }
        return res.status(403).render('403', { title: '403 — Access Denied', layout: 'layouts/main' });
    },
];

// Students
const studentGuard = [...baseGuard, requireRole('student')];

// Non-librarian teachers browsing the catalogue
const teacherBrowseGuard = [...baseGuard, requireRole('teacher')];

// Parents
const parentGuard = [...baseGuard, requireRole('parent')];

// ─── Librarian / Admin Routes — /library/* ────────────────────────────────────

router.get('/dashboard', librarianGuard, libCtrl.getDashboard);

// Books
router.get('/books',              librarianGuard, libCtrl.getBooks);
router.get('/books/bulk-upload',          librarianGuard, libCtrl.getBulkUpload);
router.get('/books/bulk-upload/template', librarianGuard, libCtrl.getBulkUploadTemplate);
router.post('/books/bulk-upload',         librarianGuard, upload.single('file'), libCtrl.postBulkUpload);
router.get('/books/create',       librarianGuard, libCtrl.getCreateBook);
router.post('/books/create',      librarianGuard, libCtrl.postCreateBook);
router.get('/books/:id',          librarianGuard, libCtrl.getBookDetail);
router.get('/books/:id/edit',     librarianGuard, libCtrl.getEditBook);
router.post('/books/:id/edit',    librarianGuard, libCtrl.postEditBook);
router.post('/books/:id/delete',  librarianGuard, libCtrl.postDeleteBook);

// Copies (managed within book detail page)
router.post('/books/:id/copies/add',                         librarianGuard, libCtrl.postAddCopy);
router.post('/books/:id/copies/:copyId/edit',                librarianGuard, libCtrl.postEditCopy);
router.post('/books/:id/copies/:copyId/mark-status',         librarianGuard, libCtrl.postMarkCopyLostOrDamaged);

// Circulation
router.get('/issue',              librarianGuard, libCtrl.getIssueForm);
router.post('/issue',             librarianGuard, libCtrl.postIssueBook);
router.get('/return',             librarianGuard, libCtrl.getReturnForm);
router.post('/return',            librarianGuard, libCtrl.postReturnBook);
router.get('/issuances',          librarianGuard, libCtrl.getIssuances);
router.post('/issuances/:id/renew', librarianGuard, libCtrl.postRenewBook);

// Reservations
router.get('/reservations',                           librarianGuard, libCtrl.getReservations);
router.post('/reservations/:id/mark-ready',           librarianGuard, libCtrl.postMarkReservationReady);
router.post('/reservations/:id/cancel',               librarianGuard, libCtrl.postCancelReservation);

// Fines
router.get('/fines',                     librarianGuard, libCtrl.getFines);
router.post('/fines/:id/collect',        librarianGuard, libCtrl.postCollectFine);
router.post('/fines/:id/waive',          librarianGuard, libCtrl.postWaiveFine);

// Policy (admin only)
router.get('/policy',  [...baseGuard, requireRole('school_admin')], libCtrl.getPolicy);
router.post('/policy', [...baseGuard, requireRole('school_admin')], libCtrl.postPolicy);

// Audit log (admin only)
router.get('/audit-log', [...baseGuard, requireRole('school_admin')], libCtrl.getAuditLog);

// ─── Student Routes — /library/student/* ─────────────────────────────────────

router.get('/student',                          studentGuard, stuCtrl.getDashboard);
router.get('/student/search',                   studentGuard, stuCtrl.getSearch);
router.post('/student/books/:bookId/reserve',   studentGuard, stuCtrl.postReserve);
router.post('/student/reservations/:id/cancel', studentGuard, stuCtrl.postCancelReservation);
router.get('/student/my-books',                 studentGuard, stuCtrl.getMyBooks);
router.get('/student/my-fines',                 studentGuard, stuCtrl.getMyFines);

// ─── Teacher (non-librarian) browse routes — /library/teacher/* ──────────────

router.get('/teacher',          teacherBrowseGuard, stuCtrl.getDashboard);
router.get('/teacher/search',   teacherBrowseGuard, stuCtrl.getSearch);
router.get('/teacher/my-books', teacherBrowseGuard, stuCtrl.getMyBooks);
router.get('/teacher/my-fines', teacherBrowseGuard, stuCtrl.getMyFines);
router.post('/teacher/reservations/:id/cancel', teacherBrowseGuard, stuCtrl.postCancelReservation);

// ─── Parent Routes — /library/parent/* ───────────────────────────────────────

router.get('/parent', parentGuard, parCtrl.getLibraryOverview);

module.exports = router;
