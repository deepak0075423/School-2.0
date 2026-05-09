const mongoose = require('mongoose');

const FeeSettingsSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, unique: true },
    onlinePaymentEnabled: { type: Boolean, default: false },
    paymentGateway: { type: String, enum: ['razorpay', 'stripe', 'none'], default: 'none' },
    razorpayKeyId: { type: String, default: '' },
    razorpayKeySecret: { type: String, default: '' },
    stripePublishableKey: { type: String, default: '' },
    stripeSecretKey: { type: String, default: '' },
    currency: { type: String, default: 'INR' },
    currencySymbol: { type: String, default: '₹' },
    roundingRule: { type: String, enum: ['none', 'round', 'ceil', 'floor'], default: 'none' },
    receipt: {
        logo: { type: String, default: '' },
        header: { type: String, default: '' },
        footer: { type: String, default: '' },
        customNotes: { type: String, default: '' },
    },
    receiptPrefix: { type: String, default: 'REC', trim: true },
    lastReceiptNumber: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

module.exports = mongoose.model('FeeSettings', FeeSettingsSchema);
