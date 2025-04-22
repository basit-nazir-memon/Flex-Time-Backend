const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const packageSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    packageType: {
        type: String,
        enum: ['standard', 'premium'],
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'usd'
    },
    status: {
        type: String,
        enum: ['pending', 'paid', 'failed'],
        default: 'pending'
    },
    stripePaymentIntentId: {
        type: String
    },
    hours: {
        type: Number,
        required: true
    }
}, {
    timestamps: true
});

const Package = mongoose.model("Package", packageSchema);
module.exports = Package; 