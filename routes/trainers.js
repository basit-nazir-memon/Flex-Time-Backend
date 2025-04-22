const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Trainer = require('../models/Trainer');
const User = require('../models/User');
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");
const Class = require('../models/Class');

// Cloudinary configuration
cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.API_KEY,
    api_secret: process.env.API_SECRET,
    secure: true,
});

// Multer configuration for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept only PDF files
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed!'), false);
        }
    }
});

// Helper function for cloudinary upload
const streamUpload = (req) => {
    return new Promise((resolve, reject) => {
        let stream = cloudinary.uploader.upload_stream(
            {
                resource_type: "raw",
                folder: "trainer-documents",
            },
            (error, result) => {
                if (result) {
                    resolve(result);
                } else {
                    reject(error);
                }
            }
        );
        streamifier.createReadStream(req.file.buffer).pipe(stream);
    });
};

// GET trainer profile
router.get('/me', auth, async (req, res) => {
    try {
        const trainer = await Trainer.findOne( {userId: req.user.id})
            .populate('userId', 'name avatar email phone')
            .populate('reviews.userId', 'name avatar')
            .lean();

        if (!trainer) {
            return res.status(404).json({ error: 'Trainer not found' });
        }

        // Format the response
        const formattedResponse = {
            fullName: trainer.userId.name,
            avatar: trainer.userId.avatar,
            email: trainer.userId.email,
            phone: trainer.userId.phone,
            specialties: trainer.specialties,
            bio: trainer.bio,
            experience: trainer.experience,
            certifications: trainer.certifications,
            availability: trainer.availability,
            documents: trainer.documents.map(doc => ({
                name: doc.name,
                url: doc.url,
                uploadedOn: doc.uploadedOn.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                }),
                status: doc.status
            })),
            totalReviews: trainer.reviews.length,
            overallRating: trainer.reviews.reduce((sum, review) => sum + review.rating, 0) / trainer.reviews.length,
            reviews: trainer.reviews.map(review => ({
                name: review.userId.name,
                date: review.date.toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                }),
                rating: review.rating,
                comment: review.comment
            }))
        };

        res.json(formattedResponse);

    } catch (error) {
        console.error('Error fetching trainer:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update trainer profile
router.put('/me', auth, async (req, res) => {
    try {
        const {
            name,
            email, 
            phone,
            avatar,
            bio,
            specialties,
            experience,
            certifications,
            availability
        } = req.body;

        // Find trainer and check if it exists
        let trainer = await Trainer.findOne( {userId: req.user.id} );

        let user = await User.findOne( {_id: req.user.id} );

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (!trainer) {
            return res.status(404).json({ error: 'Trainer not found' });
        }

        // Check if the authenticated user is the trainer
        if (trainer.userId.toString() !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized to update this profile' });
        }

        // Update fields
        const updateFields = {};
        if (bio) updateFields.bio = bio;
        if (specialties) updateFields.specialties = specialties;
        if (experience) updateFields.experience = experience;
        if (certifications) updateFields.certifications = certifications;
        if (availability) updateFields.availability = availability;

        if (name) user.name = name;
        if (email) user.email = email;
        if (phone) user.phone = phone;
        if (avatar) user.avatar = avatar;

        await user.save();
        
        // Update the trainer
        trainer = await Trainer.findOneAndUpdate(
            {userId: req.user.id},
            { $set: updateFields },
            { new: true }
        ).populate('userId', 'name avatar email phone')
         .populate('reviews.userId', 'name avatar');

        // Format the response
        const formattedResponse = {
            fullName: trainer.userId.name,
            avatar: trainer.userId.avatar,
            email: trainer.userId.email,
            phone: trainer.userId.phone,
            specialties: trainer.specialties,
            bio: trainer.bio,
            experience: trainer.experience,
            certifications: trainer.certifications,
            availability: trainer.availability,
            documents: trainer.documents.map(doc => ({
                name: doc.name,
                url: doc.url,
                uploadedOn: doc.uploadedOn.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                }),
                status: doc.status
            })),
            totalReviews: trainer.reviews.length,
            reviews: trainer.reviews.map(review => ({
                name: review.userId.name,
                date: review.date.toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                }),
                rating: review.rating,
                comment: review.comment
            }))
        };

        res.json(formattedResponse);

    } catch (error) {
        console.error('Error updating trainer:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Add document to trainer profile with file upload
router.post('/documents', auth, upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No document file provided' });
        }

        const trainer = await Trainer.findOne( {userId: req.user.id} );
        
        if (!trainer) {
            return res.status(404).json({ error: 'Trainer not found' });
        }

        // Upload file to cloudinary
        const uploadResult = await streamUpload(req);

        // Add document to trainer's documents array
        trainer.documents.push({
            name: req.body.name || req.file.originalname,
            url: uploadResult.secure_url,
            uploadedOn: new Date(),
            status: 'Valid'
        });

        await trainer.save();

        // Format the response
        const formattedDocuments = trainer.documents.map(doc => ({
            name: doc.name,
            url: doc.url,
            uploadedOn: doc.uploadedOn.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            }),
            status: doc.status
        }));

        res.status(201).json({
            message: 'Document uploaded successfully',
            documents: formattedDocuments
        });

    } catch (error) {
        console.error('Error uploading document:', error);
        res.status(500).json({ 
            error: 'Server error', 
            details: error.message 
        });
    }
});

// Optional: Add route to update document status
router.patch('/:trainerId/documents/:documentId', auth, async (req, res) => {
    try {
        const { status } = req.body;
        
        if (!['Valid', 'Expired'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status value' });
        }

        const trainer = await Trainer.findById(req.params.trainerId);
        
        if (!trainer) {
            return res.status(404).json({ error: 'Trainer not found' });
        }

        const document = trainer.documents.id(req.params.documentId);
        
        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }

        document.status = status;
        await trainer.save();

        // Format the response
        const formattedDocuments = trainer.documents.map(doc => ({
            name: doc.name,
            url: doc.url,
            uploadedOn: doc.uploadedOn.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            }),
            status: doc.status
        }));

        res.json({
            message: 'Document status updated successfully',
            documents: formattedDocuments
        });

    } catch (error) {
        console.error('Error updating document status:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get all trainers list
router.get('/list', auth, async (req, res) => {
    try {
        // Get all trainers with their user information
        const trainers = await Trainer.find()
            .populate('userId', 'name email')
            .lean();

        // Get class counts for each trainer
        // First, get all classes from the Class model
        const classesCount = await Class.aggregate([
            {
                $group: {
                    _id: '$trainerId',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Create a map of trainer ID to class count
        const classCountMap = new Map(
            classesCount.map(item => [item._id.toString(), item.count])
        );

        // Format the response
        const formattedTrainers = trainers.map(trainer => ({
            id: trainer._id,
            name: trainer.userId.name,
            email: trainer.userId.email,
            specialties: trainer.specialties || [],
            classes: classCountMap.get(trainer._id.toString()) || 0,
            active: true // You might want to add an 'active' field to your trainer model
                        // or determine this based on some other criteria
        }));

        res.json(formattedTrainers);

    } catch (error) {
        console.error('Error fetching trainers list:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// // Get filtered trainers list
// router.get('/list/filter', async (req, res) => {
//     try {
//         const { specialty, active, search } = req.query;

//         // Build query
//         let query = {};

//         // Add specialty filter
//         if (specialty) {
//             query.specialties = specialty;
//         }

//         // Add active status filter
//         if (active !== undefined) {
//             query.active = active === 'true';
//         }

//         // Get trainers with filters
//         let trainers = await Trainer.find(query)
//             .populate('userId', 'name email')
//             .lean();

//         // Apply search filter if provided
//         if (search) {
//             const searchLower = search.toLowerCase();
//             trainers = trainers.filter(trainer => 
//                 trainer.userId.name.toLowerCase().includes(searchLower) ||
//                 trainer.userId.email.toLowerCase().includes(searchLower) ||
//                 trainer.specialties.some(specialty => 
//                     specialty.toLowerCase().includes(searchLower)
//                 )
//             );
//         }

//         // Get class counts
//         const classesCount = await Class.aggregate([
//             {
//                 $group: {
//                     _id: '$trainerId',
//                     count: { $sum: 1 }
//                 }
//             }
//         ]);

//         const classCountMap = new Map(
//             classesCount.map(item => [item._id.toString(), item.count])
//         );

//         // Format the response
//         const formattedTrainers = trainers.map(trainer => ({
//             id: trainer._id,
//             name: trainer.userId.name,
//             email: trainer.userId.email,
//             specialties: trainer.specialties || [],
//             classes: classCountMap.get(trainer._id.toString()) || 0,
//             active: trainer.active || true
//         }));

//         // Sort by number of classes (descending)
//         formattedTrainers.sort((a, b) => b.classes - a.classes);

//         res.json(formattedTrainers);

//     } catch (error) {
//         console.error('Error fetching filtered trainers list:', error);
//         res.status(500).json({ error: 'Server error' });
//     }
// });

module.exports = router; 