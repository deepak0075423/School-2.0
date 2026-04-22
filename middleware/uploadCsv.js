const multer = require('multer');

const storage = multer.memoryStorage();

const uploadCsv = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'text/csv',
            'application/csv',
            'text/plain',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ];
        const allowedExts = /\.(csv|xlsx|xls)$/i;
        if (allowedMimes.includes(file.mimetype) || allowedExts.test(file.originalname)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only CSV or Excel files are allowed.'), false);
        }
    },
});

module.exports = uploadCsv;
