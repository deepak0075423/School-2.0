'use strict';
const Payslip = require('../models/Payslip');

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatPayslipText(payslip) {
    const e = payslip.employeeSnapshot || {};
    const s = payslip.schoolSnapshot   || {};
    const lines = [
        `SALARY SLIP — ${MONTHS[(payslip.month || 1) - 1]} ${payslip.year}`,
        `School: ${s.name || ''}`,
        '',
        `Employee: ${e.name || ''}  ID: ${e.employeeId || ''}`,
        `Designation: ${e.designation || ''}  Dept: ${e.department || ''}`,
        '',
        '--- EARNINGS ---',
        ...(payslip.earnings || []).map(e => `  ${e.name.padEnd(25)} ₹${e.amount.toFixed(2)}`),
        '',
        '--- DEDUCTIONS ---',
        ...(payslip.deductions || []).map(d => `  ${d.name.padEnd(25)} ₹${d.amount.toFixed(2)}`),
        '',
        `Gross Salary:       ₹${(payslip.grossSalary || 0).toFixed(2)}`,
        `Total Deductions:   ₹${(payslip.totalDeductions || 0).toFixed(2)}`,
        `Net Salary:         ₹${(payslip.netSalary || 0).toFixed(2)}`,
    ];
    return lines.join('\n');
}

// ── Admin: Download specific payslip ─────────────────────────────────────────

exports.adminDownloadPayslip = async (req, res) => {
    try {
        const payslip = await Payslip.findOne({ _id: req.params.id, school: req.schoolId }).lean();
        if (!payslip) return res.status(404).json({ success: false, message: 'Payslip not found' });

        const text = formatPayslipText(payslip);
        res.setHeader('Content-Disposition', `attachment; filename="payslip_${payslip.year}_${payslip.month}.txt"`);
        res.setHeader('Content-Type', 'text/plain');
        res.send(text);
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// ── Teacher: My payslips ──────────────────────────────────────────────────────

exports.getMyPayslips = async (req, res) => {
    try {
        const { year } = req.query;
        const filter = { employee: req.userId, school: req.schoolId };
        if (year) filter.year = +year;

        const payslips = await Payslip.find(filter)
            .select('-earnings -deductions')
            .sort({ year: -1, month: -1 })
            .lean();
        res.json({ success: true, data: payslips });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.getPayslipDetail = async (req, res) => {
    try {
        const payslip = await Payslip.findOne({ _id: req.params.id, employee: req.userId, school: req.schoolId }).lean();
        if (!payslip) return res.status(404).json({ success: false, message: 'Payslip not found' });
        res.json({ success: true, data: payslip });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.downloadPayslip = async (req, res) => {
    try {
        const payslip = await Payslip.findOne({ _id: req.params.id, employee: req.userId, school: req.schoolId }).lean();
        if (!payslip) return res.status(404).json({ success: false, message: 'Payslip not found' });

        const text = formatPayslipText(payslip);
        res.setHeader('Content-Disposition', `attachment; filename="payslip_${payslip.year}_${payslip.month}.txt"`);
        res.setHeader('Content-Type', 'text/plain');
        res.send(text);
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
