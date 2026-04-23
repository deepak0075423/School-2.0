const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const ALLOWED_MIME = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
]);

const ALLOWED_EXT = new Set([
    '.pdf', '.doc', '.docx', '.xls', '.xlsx',
    '.jpg', '.jpeg', '.png', '.gif', '.webp',
]);

const storage = multer.diskStorage({
    destination(req, file, cb) {
        const dest = path.join(process.cwd(), 'public', 'uploads', 'documents');
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        cb(null, dest);
    },
    filename(req, file, cb) {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext    = path.extname(file.originalname).toLowerCase();
        cb(null, 'doc-' + unique + ext);
    },
});

const uploadDocument = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB per file
    fileFilter(req, file, cb) {
        const ext     = path.extname(file.originalname).toLowerCase();
        const mimeOk  = ALLOWED_MIME.has(file.mimetype);
        const extOk   = ALLOWED_EXT.has(ext);
        if (mimeOk && extOk) return cb(null, true);
        cb(new Error(`File type not allowed. Supported: PDF, Word, Excel, Images.`), false);
    },
});

// Submission upload (student files)
const submissionStorage = multer.diskStorage({
    destination(req, file, cb) {
        const dest = path.join(process.cwd(), 'public', 'uploads', 'submissions');
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        cb(null, dest);
    },
    filename(req, file, cb) {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext    = path.extname(file.originalname).toLowerCase();
        cb(null, 'sub-' + unique + ext);
    },
});

const uploadSubmission = multer({
    storage: submissionStorage,
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter(req, file, cb) {
        const ext    = path.extname(file.originalname).toLowerCase();
        const mimeOk = ALLOWED_MIME.has(file.mimetype);
        const extOk  = ALLOWED_EXT.has(ext);
        if (mimeOk && extOk) return cb(null, true);
        cb(new Error(`File type not allowed.`), false);
    },
});

module.exports = { uploadDocument, uploadSubmission };
