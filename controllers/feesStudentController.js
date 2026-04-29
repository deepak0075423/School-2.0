const mongoose  = require('mongoose');
const crypto    = require('crypto');
const AcademicYear      = require('../models/AcademicYear');
const FeeLedger         = require('../models/FeeLedger');
const FeePayment        = require('../models/FeePayment');
const FeeSettings       = require('../models/FeeSettings');
const StudentConcession = require('../models/StudentConcession');
const FineRule          = require('../models/FineRule');
const StudentProfile    = require('../models/StudentProfile');
const FeeStructure      = require('../models/FeeStructure');
const StudentFeeAssignment = require('../models/StudentFeeAssignment');
const { generateReceiptPDF } = require('../utils/feeReceiptPdf');

async function getActiveAcademicYear(schoolId) {
    return AcademicYear.findOne({ school: schoolId, status: 'active' });
}

async function resolveFeeItems(studentId, academicYearId, schoolId) {
    const sfa = await StudentFeeAssignment.findOne({
        school: schoolId, student: studentId, academicYear: academicYearId, isActive: true,
    }).populate({ path: 'feeStructure', populate: { path: 'items.feeHead' } })
      .populate('customItems.feeHead');

    if (sfa) {
        if (sfa.useCustom) {
            return {
                level: 'student_custom', sourceType: 'StudentFeeAssignment',
                items: sfa.customItems.map(i => ({
                    feeHeadId: i.feeHead?._id, feeName: i.feeName || i.feeHead?.name || '',
                    category: i.feeHead?.category || 'custom',
                    amount: i.amount, dueDate: i.dueDate, installmentLabel: i.installmentLabel,
                })),
            };
        }
        if (sfa.feeStructure) {
            return _structureItems(sfa.feeStructure, 'student_structure');
        }
    }

    const sp = await StudentProfile.findOne({ user: studentId, school: schoolId })
        .populate({ path: 'currentSection', populate: { path: 'class' } });

    if (sp && sp.currentSection) {
        const sectionStruct = await FeeStructure.findOne({
            school: schoolId, academicYear: academicYearId,
            level: 'section', section: sp.currentSection._id, isActive: true,
        }).populate('items.feeHead');
        if (sectionStruct) return _structureItems(sectionStruct, 'section');

        const classId = sp.currentSection.class?._id || sp.currentSection.class;
        if (classId) {
            const classStruct = await FeeStructure.findOne({
                school: schoolId, academicYear: academicYearId,
                level: 'class', class: classId, isActive: true,
            }).populate('items.feeHead');
            if (classStruct) return _structureItems(classStruct, 'class');
        }
    }
    return null;
}

function _structureItems(struct, level) {
    return {
        level, sourceType: 'FeeStructure', structureId: struct._id, structureName: struct.name,
        items: (struct.items || []).filter(i => i.isActive).map(i => ({
            feeHeadId: i.feeHead?._id, feeName: i.feeHead?.name || '',
            category: i.feeHead?.category || 'custom',
            amount: i.amount, dueDate: i.dueDate, installmentLabel: i.installmentLabel,
        })),
    };
}

function calcFineAmount(items, fineRule) {
    if (!fineRule || !fineRule.isActive) return 0;
    const now = new Date();
    let total = 0;
    for (const item of items) {
        if (!item.dueDate) continue;
        const graceDue = new Date(new Date(item.dueDate).getTime() + (fineRule.gracePeriodDays || 0) * 86400000);
        if (now <= graceDue) continue;
        const daysLate = Math.max(1, Math.floor((now - graceDue) / 86400000));
        let fine = fineRule.fineType === 'flat' ? fineRule.flatAmount : fineRule.perDayAmount * daysLate;
        if (fineRule.maxCap > 0) fine = Math.min(fine, fineRule.maxCap);
        total += fine;
    }
    return Math.round(total * 100) / 100;
}

function calcConcessionAmount(items, concessions) {
    let total = 0;
    for (const sc of concessions) {
        const c = sc.concession || sc;
        if (!c || !c.isActive) continue;
        for (const item of items) {
            const applicable = c.applicableTo === 'all' ||
                (c.applicableTo === 'specific_heads' && c.applicableHeads &&
                 c.applicableHeads.some(h => h.toString() === (item.feeHeadId || '').toString()));
            if (!applicable) continue;
            const amt = c.concessionType === 'percentage'
                ? (item.amount * c.value / 100) : Math.min(c.value, item.amount);
            total += amt;
        }
    }
    return Math.round(total * 100) / 100;
}

// ── STUDENT: My Fees Dashboard ───────────────────────────────────────────────

exports.getMyFees = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const studentId = req.session.userId;
        const ay = await getActiveAcademicYear(schoolId);

        const [ledgerEntries, recentPayments, concessions, fineRules, profile] = await Promise.all([
            FeeLedger.find({ school: schoolId, student: studentId, academicYear: ay?._id })
                .sort({ createdAt: -1 }).limit(20),
            FeePayment.find({ school: schoolId, student: studentId, academicYear: ay?._id, paymentStatus: 'completed' })
                .sort({ paymentDate: -1 }).limit(10),
            StudentConcession.find({ school: schoolId, student: studentId, academicYear: ay?._id, isActive: true })
                .populate('concession'),
            FineRule.find({ school: schoolId, isActive: true }),
            StudentProfile.findOne({ user: studentId, school: schoolId })
                .populate({ path: 'currentSection', populate: { path: 'class', select: 'className classNumber' } }),
        ]);

        const resolved = await resolveFeeItems(studentId, ay?._id, schoolId);
        const balance  = ledgerEntries.length ? ledgerEntries[0].runningBalance : 0;
        const totalCharged  = ledgerEntries.filter(e => e.entryType === 'debit' && e.category === 'fee_charged').reduce((s, e) => s + e.amount, 0);
        const totalPaid     = ledgerEntries.filter(e => e.entryType === 'credit' && e.category === 'payment').reduce((s, e) => s + e.amount, 0);
        const totalConcession = calcConcessionAmount(resolved?.items || [], concessions);
        const fineAmt = resolved && fineRules.length ? calcFineAmount(resolved.items, fineRules[0]) : 0;

        res.render('fees/student/dashboard', {
            title: 'My Fees', layout: 'layouts/main',
            resolved, balance, totalCharged, totalPaid, totalConcession, fineAmt,
            recentPayments, concessions, activeYear: ay, profile,
            payUrl:         '/fees/student/pay',
            ledgerUrl:      '/fees/student/ledger',
            paymentsUrl:    '/fees/student/payments',
            receiptBaseUrl: '/fees/student/payments',
        });
    } catch (err) {
        console.error('[Fees] getMyFees (student):', err);
        req.flash('error', 'Failed to load your fees.');
        res.redirect('/student/dashboard');
    }
};

exports.getMyLedger = async (req, res) => {
    try {
        const schoolId  = req.session.schoolId;
        const studentId = req.session.userId;
        const ay = await getActiveAcademicYear(schoolId);
        const entries = await FeeLedger.find({ school: schoolId, student: studentId, academicYear: ay?._id })
            .sort({ createdAt: -1 });
        const balance = entries.length ? entries[0].runningBalance : 0;
        res.render('fees/student/ledger', {
            title: 'My Fee Ledger', layout: 'layouts/main', entries, balance, activeYear: ay,
        });
    } catch (err) {
        req.flash('error', 'Failed to load ledger.'); res.redirect('/fees/student/my-fees');
    }
};

exports.getMyPayments = async (req, res) => {
    try {
        const schoolId  = req.session.schoolId;
        const studentId = req.session.userId;
        const ay = await getActiveAcademicYear(schoolId);
        const payments = await FeePayment.find({ school: schoolId, student: studentId, academicYear: ay?._id })
            .sort({ paymentDate: -1 });
        const total = payments.filter(p => p.paymentStatus === 'completed').reduce((s, p) => s + p.amount, 0);
        res.render('fees/student/payments', {
            title: 'My Payments', layout: 'layouts/main', payments, total, activeYear: ay,
        });
    } catch (err) {
        req.flash('error', 'Failed to load payments.'); res.redirect('/fees/student/my-fees');
    }
};

exports.getMyReceipt = async (req, res) => {
    try {
        const payment = await FeePayment.findOne({
            _id: req.params.id, student: req.session.userId, school: req.session.schoolId,
        }).populate('student', 'name email').populate('lines.feeHead', 'name');
        if (!payment) { req.flash('error', 'Receipt not found.'); return res.redirect('/fees/student/payments'); }
        const settings = await FeeSettings.findOne({ school: req.session.schoolId });
        res.render('fees/student/receipt', {
            title: `Receipt — ${payment.receiptNumber}`, layout: 'layouts/main', payment, settings,
            backUrl:     '/fees/student/payments',
            downloadUrl: `/fees/student/payments/${req.params.id}/download`,
        });
    } catch (err) {
        req.flash('error', 'Not found.'); res.redirect('/fees/student/payments');
    }
};

exports.downloadMyReceipt = async (req, res) => {
    try {
        const payment = await FeePayment.findOne({
            _id: req.params.id, student: req.session.userId, school: req.session.schoolId,
        }).populate('student', 'name email').populate('lines.feeHead', 'name');
        if (!payment) { req.flash('error', 'Receipt not found.'); return res.redirect('/fees/student/payments'); }
        const settings = await FeeSettings.findOne({ school: req.session.schoolId });
        const School   = require('../models/School');
        const school   = await School.findById(req.session.schoolId);
        generateReceiptPDF(res, payment, school, settings, `receipt-${payment.receiptNumber}.pdf`);
    } catch (err) {
        console.error('[Fees] downloadMyReceipt:', err);
        req.flash('error', 'Download failed.'); res.redirect('/fees/student/payments');
    }
};

// ── helpers ──────────────────────────────────────────────────────────────────

async function getOrCreateReceiptNumber(schoolId) {
    const settings = await FeeSettings.findOneAndUpdate(
        { school: schoolId },
        { $inc: { lastReceiptNumber: 1 } },
        { new: true, upsert: true }
    );
    return `${settings.receiptPrefix || 'REC'}-${String(settings.lastReceiptNumber).padStart(6, '0')}`;
}

async function recordCompletedPayment({ schoolId, studentId, academicYearId, amount, paymentMode,
    gateway, gatewayOrderId, gatewayPaymentId, transactionRef, remarks, collectedBy, studentName, schoolName }) {

    const receiptNumber = await getOrCreateReceiptNumber(schoolId);
    const prevLedger = await FeeLedger.findOne(
        { school: schoolId, student: studentId, academicYear: academicYearId },
        { runningBalance: 1 }, { sort: { createdAt: -1 } }
    );
    const prevBalance = prevLedger?.runningBalance || 0;

    const payment = await FeePayment.create({
        school: schoolId, student: studentId, academicYear: academicYearId,
        receiptNumber, amount,
        lines: [{ feeName: 'Fee Payment', amount }],
        paymentMode, paymentStatus: 'completed',
        gateway: gateway || 'manual',
        gatewayOrderId: gatewayOrderId || '',
        gatewayPaymentId: gatewayPaymentId || '',
        transactionRef: transactionRef || gatewayPaymentId || '',
        remarks: remarks || '',
        paymentDate: new Date(),
        collectedBy: collectedBy || null,
        idempotencyKey: `gw-${schoolId}-${studentId}-${Date.now()}`,
        schoolSnapshot: { name: schoolName },
        studentSnapshot: { name: studentName, id: studentId },
    });

    const ledgerEntry = await FeeLedger.create({
        school: schoolId, student: studentId, academicYear: academicYearId,
        entryType: 'credit', category: 'payment', amount,
        description: `Payment received — Receipt ${receiptNumber}`,
        referenceType: 'FeePayment', referenceId: payment._id,
        runningBalance: Math.round((prevBalance - amount) * 100) / 100,
        createdBy: collectedBy || studentId,
    });

    payment.ledgerEntry = ledgerEntry._id;
    await payment.save();
    return payment;
}

// ── STUDENT: Pay Now ─────────────────────────────────────────────────────────

exports.getPayNow = async (req, res) => {
    try {
        const schoolId  = req.session.schoolId;
        const studentId = req.session.userId;
        const ay = await getActiveAcademicYear(schoolId);
        if (!ay) { req.flash('error', 'No active academic year.'); return res.redirect('/fees/student/my-fees'); }

        const [lastLedger, settings, resolved] = await Promise.all([
            FeeLedger.findOne({ school: schoolId, student: studentId, academicYear: ay._id })
                .sort({ createdAt: -1 }),
            FeeSettings.findOne({ school: schoolId }),
            resolveFeeItems(studentId, ay._id, schoolId),
        ]);
        const balance = lastLedger?.runningBalance || 0;

        if (balance <= 0) {
            req.flash('success', 'You have no outstanding dues!');
            return res.redirect('/fees/student/my-fees');
        }

        const gateway = settings?.onlinePaymentEnabled && settings?.paymentGateway !== 'none'
            ? settings.paymentGateway : 'none';

        res.render('fees/student/pay', {
            title: 'Pay Fees', layout: 'layouts/main',
            balance, resolved, activeYear: ay,
            gateway,
            razorpayKeyId: gateway === 'razorpay' ? settings.razorpayKeyId : '',
            stripePublishableKey: gateway === 'stripe' ? settings.stripePublishableKey : '',
            currency: settings?.currency || 'INR',
            currencySymbol: settings?.currencySymbol || '₹',
            studentName: req.session.userName || '',
            schoolName:  req.session.schoolName || '',
        });
    } catch (err) {
        console.error('[Fees] getPayNow:', err);
        req.flash('error', 'Failed to load payment page.'); res.redirect('/fees/student/my-fees');
    }
};

// ── Razorpay: create order ───────────────────────────────────────────────────

exports.postCreateRazorpayOrder = async (req, res) => {
    try {
        const schoolId  = req.session.schoolId;
        const studentId = req.session.userId;
        const { amount } = req.body;
        const payAmt = parseFloat(amount);
        if (!payAmt || payAmt <= 0) return res.json({ error: 'Invalid amount' });

        const settings = await FeeSettings.findOne({ school: schoolId });
        if (!settings?.razorpayKeyId || !settings?.razorpayKeySecret)
            return res.json({ error: 'Razorpay not configured.' });

        const Razorpay = require('razorpay');
        const rzp = new Razorpay({ key_id: settings.razorpayKeyId, key_secret: settings.razorpayKeySecret });

        const ay = await getActiveAcademicYear(schoolId);
        const order = await rzp.orders.create({
            amount: Math.round(payAmt * 100),
            currency: settings.currency || 'INR',
            receipt: `F-${studentId.toString().slice(-10)}-${Date.now().toString().slice(-8)}`,
            notes: { schoolId: schoolId.toString(), studentId: studentId.toString(), academicYearId: ay?._id?.toString() },
        });

        res.json({ orderId: order.id, amount: order.amount, currency: order.currency });
    } catch (err) {
        console.error('[Fees] createRazorpayOrder:', err);
        const msg = err.error?.description || err.message || 'Order creation failed.';
        res.json({ error: msg });
    }
};

// ── Razorpay: verify & record ────────────────────────────────────────────────

exports.postVerifyRazorpay = async (req, res) => {
    try {
        const schoolId  = req.session.schoolId;
        const studentId = req.session.userId;
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount, remarks } = req.body;

        const settings = await FeeSettings.findOne({ school: schoolId });
        if (!settings?.razorpayKeySecret) throw new Error('Gateway not configured.');

        // Verify signature
        const expectedSig = crypto.createHmac('sha256', settings.razorpayKeySecret)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');
        if (expectedSig !== razorpay_signature) throw new Error('Payment verification failed. Please contact admin.');

        const ay = await getActiveAcademicYear(schoolId);
        const student = await require('../models/User').findById(studentId).select('name');

        const payment = await recordCompletedPayment({
            schoolId, studentId, academicYearId: ay._id,
            amount: parseFloat(amount),
            paymentMode: 'online', gateway: 'razorpay',
            gatewayOrderId: razorpay_order_id,
            gatewayPaymentId: razorpay_payment_id,
            collectedBy: null,
            studentName: student?.name || '', schoolName: req.session.schoolName || '',
        });

        req.flash('success', `Payment of ${settings.currencySymbol}${parseFloat(amount).toLocaleString('en-IN')} successful! Receipt: ${payment.receiptNumber}`);
        res.json({ success: true, receiptUrl: `/fees/student/payments/${payment._id}/receipt` });
    } catch (err) {
        console.error('[Fees] verifyRazorpay:', err);
        res.json({ error: err.error?.description || err.message || 'Verification failed.' });
    }
};

// ── Stripe: create PaymentIntent ─────────────────────────────────────────────

exports.postCreateStripeIntent = async (req, res) => {
    try {
        const schoolId  = req.session.schoolId;
        const studentId = req.session.userId;
        const { amount } = req.body;
        const payAmt = parseFloat(amount);
        if (!payAmt || payAmt <= 0) return res.json({ error: 'Invalid amount' });

        const settings = await FeeSettings.findOne({ school: schoolId });
        if (!settings?.stripeSecretKey) return res.json({ error: 'Stripe not configured.' });

        const stripe = require('stripe')(settings.stripeSecretKey);
        const ay = await getActiveAcademicYear(schoolId);
        const intent = await stripe.paymentIntents.create({
            amount: Math.round(payAmt * 100),
            currency: (settings.currency || 'INR').toLowerCase(),
            metadata: { schoolId: schoolId.toString(), studentId: studentId.toString(), academicYearId: ay?._id?.toString() },
        });

        res.json({ clientSecret: intent.client_secret });
    } catch (err) {
        console.error('[Fees] createStripeIntent:', err);
        res.json({ error: err.message || err.raw?.message || 'Intent creation failed.' });
    }
};

// ── Stripe: confirm & record ─────────────────────────────────────────────────

exports.postVerifyStripe = async (req, res) => {
    try {
        const schoolId  = req.session.schoolId;
        const studentId = req.session.userId;
        const { paymentIntentId, amount, remarks } = req.body;

        const settings = await FeeSettings.findOne({ school: schoolId });
        if (!settings?.stripeSecretKey) throw new Error('Gateway not configured.');

        const stripe = require('stripe')(settings.stripeSecretKey);
        const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (intent.status !== 'succeeded') throw new Error(`Payment not completed. Status: ${intent.status}`);

        const ay = await getActiveAcademicYear(schoolId);
        const student = await require('../models/User').findById(studentId).select('name');

        const payment = await recordCompletedPayment({
            schoolId, studentId, academicYearId: ay._id,
            amount: parseFloat(amount),
            paymentMode: 'online', gateway: 'stripe',
            gatewayPaymentId: paymentIntentId,
            collectedBy: null,
            studentName: student?.name || '', schoolName: req.session.schoolName || '',
        });

        req.flash('success', `Payment of ${settings.currencySymbol}${parseFloat(amount).toLocaleString('en-IN')} successful! Receipt: ${payment.receiptNumber}`);
        res.json({ success: true, receiptUrl: `/fees/student/payments/${payment._id}/receipt` });
    } catch (err) {
        console.error('[Fees] verifyStripe:', err);
        res.json({ error: err.message || 'Verification failed.' });
    }
};

// ── Offline / manual payment submission ─────────────────────────────────────

exports.postPayNow = async (req, res) => {
    try {
        const schoolId  = req.session.schoolId;
        const studentId = req.session.userId;
        const { amount, paymentMode, transactionRef, paymentDate, remarks } = req.body;
        const ay = await getActiveAcademicYear(schoolId);
        if (!ay) throw new Error('No active academic year.');

        const payAmt = parseFloat(amount);
        if (!payAmt || payAmt <= 0) throw new Error('Invalid amount.');

        const student = await require('../models/User').findById(studentId).select('name');

        await FeePayment.create({
            school: schoolId, student: studentId, academicYear: ay._id,
            amount: payAmt, lines: [{ feeName: 'Fee Payment', amount: payAmt }],
            paymentMode, paymentStatus: 'pending',
            transactionRef: transactionRef || '', remarks: remarks || '',
            paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
            idempotencyKey: `student-${schoolId}-${studentId}-${Date.now()}`,
            schoolSnapshot: { name: req.session.schoolName },
            studentSnapshot: { name: student?.name, id: studentId },
        });

        req.flash('success', `Payment of ₹${payAmt.toLocaleString('en-IN')} submitted for verification. Admin will confirm shortly.`);
        res.redirect('/fees/student/payments');
    } catch (err) {
        console.error('[Fees] postPayNow:', err);
        req.flash('error', err.message || 'Payment submission failed.');
        res.redirect('/fees/student/pay');
    }
};

// ── PARENT: Child Fees ───────────────────────────────────────────────────────

exports.getParentFeesRedirect = async (req, res) => {
    try {
        const StudentProfile = require('../models/StudentProfile');
        const profile = await StudentProfile.findOne({ parent: req.session.userId })
            .populate('user', '_id');
        if (profile && profile.user) {
            return res.redirect(`/fees/parent/child/${profile.user._id}/fees`);
        }
        req.flash('error', 'No child linked to your account. Contact the school admin.');
        res.redirect('/parent/dashboard');
    } catch (err) {
        res.redirect('/parent/dashboard');
    }
};

exports.getParentChildFees = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const { childId } = req.params;
        const ay = await getActiveAcademicYear(schoolId);

        const User = require('../models/User');
        const student = await User.findOne({ _id: childId, school: schoolId, role: 'student' }).select('name');
        if (!student) { req.flash('error', 'Child not found.'); return res.redirect('/parent/dashboard'); }

        const [ledgerEntries, payments, settings, concessions, fineRules] = await Promise.all([
            FeeLedger.find({ school: schoolId, student: childId, academicYear: ay?._id }).sort({ createdAt: -1 }).limit(30),
            FeePayment.find({ school: schoolId, student: childId, academicYear: ay?._id }).sort({ paymentDate: -1 }),
            FeeSettings.findOne({ school: schoolId }),
            StudentConcession.find({ school: schoolId, student: childId, academicYear: ay?._id, isActive: true }).populate('concession'),
            FineRule.find({ school: schoolId, isActive: true }),
        ]);

        const balance       = ledgerEntries.length ? ledgerEntries[0].runningBalance : 0;
        const totalPaid     = payments.filter(p => p.paymentStatus === 'completed').reduce((s, p) => s + p.amount, 0);
        const totalCharged  = ledgerEntries.filter(e => e.entryType === 'debit').reduce((s, e) => s + e.amount, 0);
        const resolved      = await resolveFeeItems(childId, ay?._id, schoolId);
        const totalConcession = calcConcessionAmount(resolved?.items || [], concessions);
        const fineAmt       = resolved && fineRules.length ? calcFineAmount(resolved.items, fineRules[0]) : 0;

        const gateway = settings?.onlinePaymentEnabled && settings?.paymentGateway !== 'none'
            ? settings.paymentGateway : 'none';

        res.render('fees/parent/child-fees', {
            title: `Fees — ${student.name}`, layout: 'layouts/main',
            child: student, childId,
            resolved, balance, payments,
            totalCharged, totalPaid, totalConcession, fineAmt,
            concessions, activeYear: ay, gateway,
        });
    } catch (err) {
        console.error('[Fees] getParentChildFees:', err);
        req.flash('error', 'Failed to load fees.'); res.redirect('/parent/dashboard');
    }
};

// ── PARENT: Pay Now ──────────────────────────────────────────────────────────

exports.getParentPayNow = async (req, res) => {
    try {
        const schoolId  = req.session.schoolId;
        const { childId } = req.params;
        const ay = await getActiveAcademicYear(schoolId);
        if (!ay) { req.flash('error', 'No active academic year.'); return res.redirect(`/fees/parent/child/${childId}/fees`); }

        const User = require('../models/User');
        const [lastLedger, settings, resolved, student] = await Promise.all([
            FeeLedger.findOne({ school: schoolId, student: childId, academicYear: ay._id }).sort({ createdAt: -1 }),
            FeeSettings.findOne({ school: schoolId }),
            resolveFeeItems(childId, ay._id, schoolId),
            User.findOne({ _id: childId, school: schoolId, role: 'student' }).select('name'),
        ]);

        if (!student) { req.flash('error', 'Child not found.'); return res.redirect('/parent/dashboard'); }

        const balance = lastLedger?.runningBalance || 0;
        if (balance <= 0) {
            req.flash('success', `${student.name} has no outstanding dues!`);
            return res.redirect(`/fees/parent/child/${childId}/fees`);
        }

        const gateway = settings?.onlinePaymentEnabled && settings?.paymentGateway !== 'none'
            ? settings.paymentGateway : 'none';

        res.render('fees/parent/pay', {
            title: `Pay Fees — ${student.name}`, layout: 'layouts/main',
            balance, resolved, activeYear: ay, childId,
            studentName: student.name,
            gateway,
            razorpayKeyId:       gateway === 'razorpay' ? settings.razorpayKeyId       : '',
            stripePublishableKey: gateway === 'stripe'   ? settings.stripePublishableKey : '',
            currency:       settings?.currency       || 'INR',
            currencySymbol: settings?.currencySymbol || '₹',
            schoolName: req.session.schoolName || '',
        });
    } catch (err) {
        console.error('[Fees] getParentPayNow:', err);
        req.flash('error', 'Failed to load payment page.');
        res.redirect('/parent/dashboard');
    }
};

exports.postParentPayNow = async (req, res) => {
    const { childId } = req.params;
    try {
        const schoolId = req.session.schoolId;
        const { amount, paymentMode, transactionRef, paymentDate, remarks } = req.body;
        const ay = await getActiveAcademicYear(schoolId);
        if (!ay) throw new Error('No active academic year.');

        const payAmt = parseFloat(amount);
        if (!payAmt || payAmt <= 0) throw new Error('Invalid amount.');

        const User = require('../models/User');
        const student = await User.findOne({ _id: childId, school: schoolId, role: 'student' }).select('name');
        if (!student) throw new Error('Child not found.');

        await FeePayment.create({
            school: schoolId, student: childId, academicYear: ay._id,
            amount: payAmt, lines: [{ feeName: 'Fee Payment', amount: payAmt }],
            paymentMode, paymentStatus: 'pending',
            transactionRef: transactionRef || '', remarks: remarks || '',
            paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
            idempotencyKey: `parent-${schoolId}-${childId}-${Date.now()}`,
            schoolSnapshot: { name: req.session.schoolName },
            studentSnapshot: { name: student.name, id: childId },
        });

        req.flash('success', `Payment of ₹${payAmt.toLocaleString('en-IN')} for ${student.name} submitted. Admin will verify shortly.`);
        res.redirect(`/fees/parent/child/${childId}/fees`);
    } catch (err) {
        console.error('[Fees] postParentPayNow:', err);
        req.flash('error', err.message || 'Payment submission failed.');
        res.redirect(`/fees/parent/child/${childId}/pay`);
    }
};

exports.postParentCreateRazorpayOrder = async (req, res) => {
    try {
        const schoolId  = req.session.schoolId;
        const { childId } = req.params;
        const { amount } = req.body;
        const payAmt = parseFloat(amount);
        if (!payAmt || payAmt <= 0) return res.json({ error: 'Invalid amount' });

        const settings = await FeeSettings.findOne({ school: schoolId });
        if (!settings?.razorpayKeyId || !settings?.razorpayKeySecret)
            return res.json({ error: 'Razorpay not configured.' });

        const Razorpay = require('razorpay');
        const rzp = new Razorpay({ key_id: settings.razorpayKeyId, key_secret: settings.razorpayKeySecret });
        const ay  = await getActiveAcademicYear(schoolId);

        const order = await rzp.orders.create({
            amount: Math.round(payAmt * 100),
            currency: settings.currency || 'INR',
            receipt: `P-${childId.toString().slice(-8)}-${Date.now().toString().slice(-8)}`,
            notes: { schoolId: schoolId.toString(), studentId: childId.toString(), paidBy: 'parent', academicYearId: ay?._id?.toString() },
        });

        res.json({ orderId: order.id, amount: order.amount, currency: order.currency });
    } catch (err) {
        console.error('[Fees] parentCreateRazorpayOrder:', err);
        res.json({ error: err.error?.description || err.message || 'Order creation failed.' });
    }
};

exports.postParentVerifyRazorpay = async (req, res) => {
    const { childId } = req.params;
    try {
        const schoolId = req.session.schoolId;
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;

        const settings = await FeeSettings.findOne({ school: schoolId });
        if (!settings?.razorpayKeySecret) throw new Error('Gateway not configured.');

        const expectedSig = crypto.createHmac('sha256', settings.razorpayKeySecret)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');
        if (expectedSig !== razorpay_signature) throw new Error('Payment verification failed. Please contact admin.');

        const User = require('../models/User');
        const [ay, student] = await Promise.all([
            getActiveAcademicYear(schoolId),
            User.findById(childId).select('name'),
        ]);

        const payment = await recordCompletedPayment({
            schoolId, studentId: childId, academicYearId: ay._id,
            amount: parseFloat(amount),
            paymentMode: 'online', gateway: 'razorpay',
            gatewayOrderId: razorpay_order_id,
            gatewayPaymentId: razorpay_payment_id,
            collectedBy: null,
            studentName: student?.name || '', schoolName: req.session.schoolName || '',
        });

        req.flash('success', `Payment of ₹${parseFloat(amount).toLocaleString('en-IN')} for ${student?.name} successful! Receipt: ${payment.receiptNumber}`);
        res.json({ success: true, receiptUrl: `/fees/parent/child/${childId}/payments/${payment._id}/receipt` });
    } catch (err) {
        console.error('[Fees] parentVerifyRazorpay:', err);
        res.json({ error: err.error?.description || err.message || 'Verification failed.' });
    }
};

exports.postParentCreateStripeIntent = async (req, res) => {
    try {
        const schoolId = req.session.schoolId;
        const { childId } = req.params;
        const { amount } = req.body;
        const payAmt = parseFloat(amount);
        if (!payAmt || payAmt <= 0) return res.json({ error: 'Invalid amount' });

        const settings = await FeeSettings.findOne({ school: schoolId });
        if (!settings?.stripeSecretKey) return res.json({ error: 'Stripe not configured.' });

        const stripe = require('stripe')(settings.stripeSecretKey);
        const ay = await getActiveAcademicYear(schoolId);
        const intent = await stripe.paymentIntents.create({
            amount: Math.round(payAmt * 100),
            currency: (settings.currency || 'INR').toLowerCase(),
            metadata: { schoolId: schoolId.toString(), studentId: childId.toString(), paidBy: 'parent', academicYearId: ay?._id?.toString() },
        });

        res.json({ clientSecret: intent.client_secret });
    } catch (err) {
        console.error('[Fees] parentCreateStripeIntent:', err);
        res.json({ error: err.message || err.raw?.message || 'Intent creation failed.' });
    }
};

exports.postParentVerifyStripe = async (req, res) => {
    const { childId } = req.params;
    try {
        const schoolId = req.session.schoolId;
        const { paymentIntentId, amount } = req.body;

        const settings = await FeeSettings.findOne({ school: schoolId });
        if (!settings?.stripeSecretKey) throw new Error('Gateway not configured.');

        const stripe = require('stripe')(settings.stripeSecretKey);
        const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (intent.status !== 'succeeded') throw new Error(`Payment not completed. Status: ${intent.status}`);

        const User = require('../models/User');
        const [ay, student] = await Promise.all([
            getActiveAcademicYear(schoolId),
            User.findById(childId).select('name'),
        ]);

        const payment = await recordCompletedPayment({
            schoolId, studentId: childId, academicYearId: ay._id,
            amount: parseFloat(amount),
            paymentMode: 'online', gateway: 'stripe',
            gatewayPaymentId: paymentIntentId,
            collectedBy: null,
            studentName: student?.name || '', schoolName: req.session.schoolName || '',
        });

        req.flash('success', `Payment successful! Receipt: ${payment.receiptNumber}`);
        res.json({ success: true, receiptUrl: `/fees/parent/child/${childId}/payments/${payment._id}/receipt` });
    } catch (err) {
        console.error('[Fees] parentVerifyStripe:', err);
        res.json({ error: err.message || 'Verification failed.' });
    }
};

exports.getParentPaymentReceipt = async (req, res) => {
    try {
        const { childId, paymentId } = req.params;
        const payment = await FeePayment.findOne({
            _id: paymentId, student: childId, school: req.session.schoolId,
        }).populate('student', 'name email').populate('lines.feeHead', 'name');
        if (!payment) { req.flash('error', 'Receipt not found.'); return res.redirect(`/fees/parent/child/${childId}/fees`); }
        const settings = await FeeSettings.findOne({ school: req.session.schoolId });
        res.render('fees/student/receipt', {
            title: `Receipt — ${payment.receiptNumber}`, layout: 'layouts/main', payment, settings,
            backUrl:     `/fees/parent/child/${childId}/fees`,
            downloadUrl: `/fees/parent/child/${childId}/payments/${paymentId}/download`,
        });
    } catch (err) {
        req.flash('error', 'Not found.'); res.redirect('/parent/dashboard');
    }
};

exports.downloadParentReceipt = async (req, res) => {
    try {
        const { childId, paymentId } = req.params;
        const payment = await FeePayment.findOne({
            _id: paymentId, student: childId, school: req.session.schoolId,
        }).populate('student', 'name email').populate('lines.feeHead', 'name');
        if (!payment) { req.flash('error', 'Receipt not found.'); return res.redirect(`/fees/parent/child/${childId}/fees`); }
        const settings = await FeeSettings.findOne({ school: req.session.schoolId });
        const School   = require('../models/School');
        const school   = await School.findById(req.session.schoolId);
        generateReceiptPDF(res, payment, school, settings, `receipt-${payment.receiptNumber}.pdf`);
    } catch (err) {
        console.error('[Fees] downloadParentReceipt:', err);
        req.flash('error', 'Download failed.'); res.redirect('/parent/dashboard');
    }
};
