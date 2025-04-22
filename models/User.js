const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const userSchema = new Schema({
    googleId: { type: String },
    name: { type: String, required: true },
    avatar: { type: String, default: "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png" },
    password: { type: String },
    role: { type: String, enum: ["trainer", "admin", "user"], default: "user" },
    blocked: { type: Boolean, default: false },
    phone: { type: String},
    createdAt: { type: Date, default: Date.now},
    email: { type: String },
    address: { type: String},
    age: { type: Number },
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    remainingMinutes: { 
        type: Number, 
        default: 0 
    },
});

const User = mongoose.model("User", userSchema);
module.exports = User;