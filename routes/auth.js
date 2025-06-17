const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");
const Trainer = require('../models/Trainer');
const { OAuth2Client } = require('google-auth-library');
const passport = require('passport');
require('dotenv').config();

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *         email:
 *           type: string
 *         password:
 *           type: string
 *         role:
 *           type: string
 *           enum: [user, trainer]
 *         avatar:
 *           type: string
 *         blocked:
 *           type: boolean
 *     AuthResponse:
 *       type: object
 *       properties:
 *         token:
 *           type: string
 *         user:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             name:
 *               type: string
 *             email:
 *               type: string
 *             role:
 *               type: string
 *             avatar:
 *               type: string
 */

cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.API_KEY,
    api_secret: process.env.API_SECRET,
    secure: true,
});

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024,
    },
});

let streamUpload = (req) => {
    return new Promise((resolve, reject) => {
        let stream = cloudinary.uploader.upload_stream((error, result) => {
            if (result) {
                resolve(result);
            } else {
                reject(error);
            }
        });
        streamifier.createReadStream(req.file.buffer).pipe(stream);
    });
};

async function uploadFile(req) {
    let result = await streamUpload(req);
    return result;
}

/**
 * @swagger
 * /api/auth/upload-image:
 *   post:
 *     summary: Upload an image
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Image uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 image_url:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/upload-image', auth, upload.single('image'), async (req, res) => {
    try {
        const result = await uploadFile(req);
        res.status(200).json({ image_url: result.secure_url });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'An error occurred while uploading the image' });
    }
});

// // Upload Profile Picture Route
// router.post('/upload-profilePic', auth, upload.single('avatar'), async (req, res) => {
//     try {
//         const result = await uploadFile(req);
//         const user = await User.findById(req.user.id);
//         if (!user) {
//             return res.status(404).json({ error: 'User not found' });
//         }
//         user.avatar = result.secure_url;
//         await user.save();
//         res.status(200).json({ avatar: result.secure_url });
//     } catch (err) {
//         console.log(err);
//         res.status(500).json({ error: 'An error occurred while uploading the avatar' });
//     }
// });


const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// POST /api/auth/google/token-login
router.post('/auth/google/token-login', async (req, res) => {
    const { token } = req.body;

    try {
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID
        });

        const payload = ticket.getPayload();

        let user = await User.findOne({ googleId: payload.sub });

        if (!user) {
            user = await User.create({
                googleId: payload.sub,
                name: payload.name,
                email: payload.email,
                avatar: payload.picture,
                role: "user",
                // add other fields you need
            });
        }

        const userPayload = {
            id: user._id,
            name: user.name,
            email: user.email,
            avatar: user.avatar,
            role: user.role
        };

        const jwtToken = jwt.sign( { user: userPayload }, process.env.JWT_SECRET, {
            expiresIn: '7d'
        });

        res.json({ token: jwtToken, user: userPayload });
    } catch (error) {
        console.error('Google login error:', error);
        res.status(401).json({ message: 'Invalid Google token' });
    }
});

// Start Google Auth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// Callback
router.get('/google/callback',
    passport.authenticate('google', {
        failureRedirect: '/login',
        session: false
    }),
    (req, res) => {
        // Send token or redirect with token
        // Example: generate JWT here
        const token = generateJWT(req.user); // your function
        res.redirect(`http://localhost:3000/user/google-success?token=${token}`);
    }
);

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fullName
 *               - email
 *               - password
 *               - confirmPassword
 *               - type
 *             properties:
 *               fullName:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               confirmPassword:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [user, trainer]
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *       400:
 *         description: Invalid input or user already exists
 *       500:
 *         description: Server error
 */
router.post('/register', async (req, res) => {
    const { fullName, email, password, confirmPassword, type } = req.body;
    
    try {
        // Validate required fields
        if (!fullName || !email || !password || !confirmPassword || !type) {
            return res.status(400).json({
                error: 'All fields are required'
            });
        }

        // Validate password match
        if (password !== confirmPassword) {
            return res.status(400).json({
                error: 'Passwords do not match'
            });
        }

        // Validate user type
        if (!['user', 'trainer'].includes(type)) {
            return res.status(400).json({
                error: 'Invalid user type. Must be either "user" or "trainer"'
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email.match(emailRegex)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        // Check if user already exists
        let existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'Email is already in use' });
        }

        // Create new user
        let user = new User({
            name: fullName,
            email,
            password,
            role: type
        });

        // Hash the password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);

        // Save the user
        await user.save();

        if (type === 'trainer') {
            let trainer = new Trainer({
                userId: user._id
            });
            await trainer.save();
        }
        
        res.status(201).json({ 
            message: 'User registered successfully',
            user: {
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server Error' });
    }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Invalid credentials
 *       500:
 *         description: Server error
 */
router.post('/login', async (req, res) => {
    const token = req.header('Authorization');
    if (token) {
        return res.status(401).json({ error: 'Already Logged In' });
    }
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ error: 'Invalid Credentials' });
        }

        if (user.blocked) {
            return res.status(400).json({ error: 'Account Blocked' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid Credentials' });
        }

        const payload = {
            user: {
                id: user.id,
                role: user.role,
                name: user.name,
                email: user.email,
                avatar: user.avatar,
            },
        };

        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1d" }, (err, token) => {
            if (err) throw err;
            res.json({ token, id: user.id, role: user.role, avatar: user.avatar, name: user.name, email: user.email });
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server Error: ' + err.message });
    
    }
});

/**
 * @swagger
 * /api/auth/auth/change-password:
 *   patch:
 *     summary: Change user password
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.patch("/auth/change-password", auth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        // Validate request body
        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                error: "Both current password and new password are required"
            });
        }

        // Password validation
        if (newPassword.length < 6) {
            return res.status(400).json({
                error: "New password must be at least 6 characters long"
            });
        }

        // Get user from database
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Verify current password
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: "Current password is incorrect" });
        }

        // Check if new password is different from current
        if (currentPassword === newPassword) {
            return res.status(400).json({
                error: "New password must be different from current password"
            });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);

        // Save updated user
        await user.save();

        res.json({
            message: "Password updated successfully",
            timestamp: new Date(),
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error("Error changing password:", error);
        res.status(500).json({
            error: "Server error",
            details: error.message
        });
    }
});

module.exports = router;