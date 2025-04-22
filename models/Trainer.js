const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const documentSchema = new Schema({
    name: { 
        type: String, 
        required: true 
    },
    url: { 
        type: String, 
        required: true 
    },
    uploadedOn: { 
        type: Date, 
        default: Date.now 
    },
    status: { 
        type: String, 
        enum: ['Valid', 'Expired'], 
        default: 'Valid' 
    }
});

const reviewSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    comment: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        default: Date.now
    }
});

const trainerSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    bio: {
        type: String
    },
    specialties: [{
        type: String
    }],
    experience: {
        type: String
    },
    certifications: {
        type: String
    },
    availability: {
        type: String
    },
    documents: [documentSchema],
    reviews: [reviewSchema]
}, {
    timestamps: true
});

const Trainer = mongoose.model("Trainer", trainerSchema);
module.exports = Trainer; 