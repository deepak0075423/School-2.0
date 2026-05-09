const mongoose = require('mongoose');

const PaymentLineSchema = new mongoose.Schema({
    feeHead: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeHead', default: null },
    feeName: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
}, { _id: false });

const FeePaymentSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    academicYear: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    receiptNumber: { type: String, default: null },
    amount: { type: Number, required: true, min: 0 },
    lines: [PaymentLineSchema],
    paymentMode: {
        type: String,
        enum: ['cash', 'cheque', 'bank_transfer', 'online', 'dd', 'upi'],
        required: true,
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'refunded'],
        default: 'completed',
    },
    transactionRef: { type: String, default: '' },
    gateway: { type: String, enum: ['razorpay', 'stripe', 'manual'], default: 'manual' },
    gatewayOrderId: { type: String, default: '' },
    gatewayPaymentId: { type: String, default: '' },
    paymentDate: { type: Date, default: Date.now },
    remarks: { type: String, default: '' },
    collectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    idempotencyKey: { type: String, default: null },
    isRefunded: { type: Boolean, default: false },
    refundedAt: { type: Date, default: null },
    refundedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    ledgerEntry: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeLedger', default: null },
    schoolSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    studentSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });

FeePaymentSchema.index({ school: 1, student: 1, academicYear: 1 });
FeePaymentSchema.index({ school: 1, paymentDate: -1 });
FeePaymentSchema.index({ school: 1, paymentStatus: 1 });
FeePaymentSchema.index({ receiptNumber: 1 }, { unique: true, sparse: true });
FeePaymentSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('FeePayment', FeePaymentSchema);
