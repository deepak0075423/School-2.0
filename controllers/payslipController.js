const Payslip   = require('../models/Payslip');
const { generatePayslipPDF } = require('../utils/payslipPdf');

const MONTH_NAMES = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

exports.getMyPayslips = async (req, res) => {
    try {
        const payslips = await Payslip.find({
            employee: req.session.userId,
            school:   req.session.schoolId,
        }).sort({ year: -1, month: -1 });

        res.render('payroll/teacher/index', {
            title: 'My Salary Slips',
            layout: 'layouts/main',
            payslips,
            MONTH_NAMES,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load salary slips.');
        res.redirect('/teacher/dashboard');
    }
};

exports.getPayslipDetail = async (req, res) => {
    try {
        const payslip = await Payslip.findOne({
            _id:      req.params.id,
            employee: req.session.userId,
            school:   req.session.schoolId,
        });
        if (!payslip) {
            req.flash('error', 'Salary slip not found.');
            return res.redirect('/payroll/teacher/payslips');
        }
        res.render('payroll/teacher/detail', {
            title: `Salary Slip — ${MONTH_NAMES[payslip.month]} ${payslip.year}`,
            layout: 'layouts/main',
            payslip,
            MONTH_NAMES,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load salary slip.');
        res.redirect('/payroll/teacher/payslips');
    }
};

exports.downloadPayslip = async (req, res) => {
    try {
        const payslip = await Payslip.findOne({
            _id:      req.params.id,
            employee: req.session.userId,
            school:   req.session.schoolId,
        });
        if (!payslip) {
            req.flash('error', 'Salary slip not found.');
            return res.redirect('/payroll/teacher/payslips');
        }
        const filename = `payslip_${MONTH_NAMES[payslip.month]}_${payslip.year}.pdf`;
        generatePayslipPDF(res, payslip, filename);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to generate PDF.');
        res.redirect('/payroll/teacher/payslips');
    }
};

// Admin can also download any payslip
exports.adminDownloadPayslip = async (req, res) => {
    try {
        const payslip = await Payslip.findOne({
            _id:    req.params.id,
            school: req.session.schoolId,
        });
        if (!payslip) {
            req.flash('error', 'Salary slip not found.');
            return res.redirect('/payroll/admin/runs');
        }
        const name = payslip.employeeSnapshot?.name?.replace(/\s+/g, '_') || 'employee';
        const filename = `payslip_${name}_${MONTH_NAMES[payslip.month]}_${payslip.year}.pdf`;
        generatePayslipPDF(res, payslip, filename);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to generate PDF.');
        res.redirect('/payroll/admin/runs');
    }
};
