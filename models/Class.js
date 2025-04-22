const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const classSchema = new Schema({
    trainerId: {
        type: Schema.Types.ObjectId,
        ref: 'Trainer',
        required: true
    },
    title: { 
        type: String, 
        required: true 
    },
    date: { 
        type: Date, 
        required: true 
    },
    type: { 
        type: String, 
        required: true 
    },
    startTime: { 
        type: String, 
        required: true 
    },
    endTime: { 
        type: String, 
        required: true 
    },
    location: { 
        type: String, 
        required: true 
    },
    maxCapacity: { 
        type: Number, 
        required: true 
    },
    description: { 
        type: String, 
        required: true 
    },
    requirements: { 
        type: String 
    },
    isRecurringClass: { 
        type: Boolean, 
        default: false 
    },
    frequency: { 
        type: String, 
        enum: ['Daily', 'Weekly', 'Bi-weekly', 'Monthly'],
        required: function() { return this.isRecurringClass; }
    },
    endDate: { 
        type: Date,
        required: function() { return this.isRecurringClass; }
    },
    attendees: [{ 
        type: Schema.Types.ObjectId, 
        ref: 'User' 
    }],
}, {
    timestamps: true
});

const Class = mongoose.model("Class", classSchema);
module.exports = Class; 