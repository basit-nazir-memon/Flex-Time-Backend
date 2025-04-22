const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const bookingSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    classId: {
        type: Schema.Types.ObjectId,
        ref: 'Class',
        required: true
    },
    minutesSpent: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true  // This will automatically add createdAt and updatedAt fields
});

const Booking = mongoose.model("Booking", bookingSchema);
module.exports = Booking; 