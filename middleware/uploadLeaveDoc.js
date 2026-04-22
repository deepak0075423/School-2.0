const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const destDir = path.join(process.cwd(), 'public', 'uploads', 'leave-docs');
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }
        cb(null, destDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, 'leave-' + uniqueSuffix + path.extname(file.originalname));
    },
});

const uploadLeaveDoc = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (req, file, cb) => {
        const mimeOk = file.mimetype === 'application/pdf';
        const extOk  = path.extname(file.originalname).toLowerCase() === '.pdf';
        if (mimeOk && extOk) return cb(null, true);
        cb(new Error('Only PDF files are allowed for leave documents.'), false);
    },
});

module.exports = uploadLeaveDoc;
