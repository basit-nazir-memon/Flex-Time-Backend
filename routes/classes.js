const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Class = require('../models/Class');
const Trainer = require('../models/Trainer');

// Create a new class
router.post('/', auth, async (req, res) => {
    try {
        const {
            title,
            date,
            type,
            startTime,
            endTime,
            location,
            maxCapacity,
            description,
            requirements,
            isRecurringClass,
            frequency,
            endDate
        } = req.body;

        // Basic validation
        if (!title || !date || !type || !startTime || !endTime || !location || !maxCapacity || !description) {
            return res.status(400).json({ error: 'Please provide all required fields' });
        }

        // Validate recurring class fields
        if (isRecurringClass && (!frequency || !endDate)) {
            return res.status(400).json({
                error: 'Frequency and end date are required for recurring classes'
            });
        }

        // Validate frequency enum
        if (isRecurringClass && !['Daily', 'Weekly', 'Bi-weekly', 'Monthly'].includes(frequency)) {
            return res.status(400).json({
                error: 'Invalid frequency value. Must be Daily, Weekly, Bi-weekly, or Monthly'
            });
        }

        const trainer = await Trainer.findOne({ userId: req.user.id });

        if (!trainer) {
            return res.status(404).json({ error: 'Trainer not found' });
        }

        // Create new class instance
        const newClass = new Class({
            title,
            date,
            type,
            startTime,
            endTime,
            location,
            maxCapacity,
            description,
            requirements,
            isRecurringClass,
            frequency: isRecurringClass ? frequency : undefined,
            endDate: isRecurringClass ? endDate : undefined,
            attendees: [],
            trainerId: trainer._id
        });

        // Save the class
        await newClass.save();

        res.status(201).json({
            message: 'Class created successfully',
            class: newClass
        });

    } catch (error) {
        console.error('Error creating class:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get all classes
router.get('/', async (req, res) => {
    try {
        const classes = await Class.find()
            .populate({
                path: 'trainerId',
                populate: {
                    path: 'userId',
                    select: 'name'
                }
            })
            .populate('attendees', 'name')
            .lean();

        // Get current date at start of day for accurate comparison
        const currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0);

        // Transform the data to match the required format
        const formattedClasses = classes.map(classItem => {
            const classDate = new Date(classItem.date);
            classDate.setHours(0, 0, 0, 0);

            return {
                id: classItem._id,
                title: classItem.title,
                date: classItem.date.toISOString().split('T')[0], // Format date as YYYY-MM-DD
                startTime: classItem.startTime,
                endTime: classItem.endTime,
                location: classItem.location,
                capacity: classItem.maxCapacity,
                booked: classItem.attendees.length,
                type: classItem.type.toLowerCase(),
                trainer: classItem.trainerId.userId.name,
                status: classDate < currentDate ? 'completed' : 'upcoming'
            };
        });

        res.json(formattedClasses);

    } catch (error) {
        console.error('Error fetching classes:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get all classes
router.get('/mine', auth, async (req, res) => {
    try {
        const classes = await Class.find()
            .populate('attendees', 'name') // we only populate the name from attendees
            .lean(); // using lean() for better performance since we're transforming the data

        // Get current date at start of day for accurate comparison
        const currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0);

        // Transform the data to match the required format
        const formattedClasses = classes.map(classItem => {
            const classDate = new Date(classItem.date);
            classDate.setHours(0, 0, 0, 0);

            return {
                id: classItem._id,
                title: classItem.title,
                date: classItem.date.toISOString().split('T')[0], // Format date as YYYY-MM-DD
                startTime: classItem.startTime,
                endTime: classItem.endTime,
                location: classItem.location,
                capacity: classItem.maxCapacity,
                booked: classItem.attendees.length,
                type: classItem.type.toLowerCase(),
                status: classDate < currentDate ? 'completed' : 'upcoming'
            };
        });

        // Sort classes: upcoming first, then completed
        const sortedClasses = formattedClasses.sort((a, b) => {
            // First sort by status (upcoming before completed)
            if (a.status === 'upcoming' && b.status === 'completed') return -1;
            if (a.status === 'completed' && b.status === 'upcoming') return 1;

            // Then sort by date
            return new Date(a.date) - new Date(b.date);
        });

        res.json(sortedClasses);

    } catch (error) {
        console.error('Error fetching classes:', error);
        res.status(500).json({ error: 'Server error' });
    }
});


// Helper function to calculate minutes between two times
function calculateMinutesBetweenTimes(startTime, endTime) {
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    
    return (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
}

// Helper function to calculate total minutes for recurring classes
function calculateRecurringClassMinutes(classDetails, singleClassMinutes) {
    const startDate = new Date(classDetails.date);
    const endDate = new Date(classDetails.endDate);
    
    // Calculate the number of days between start and end date
    const daysDifference = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    
    switch (classDetails.frequency.toLowerCase()) {
        case 'daily':
            return (daysDifference + 1) * singleClassMinutes;
            
        case 'weekly':
            const weeks = Math.ceil(daysDifference / 7);
            return weeks * singleClassMinutes;
            
        case 'bi-weekly':
            const biWeeks = Math.ceil(daysDifference / 14);
            return biWeeks * singleClassMinutes;
            
        case 'monthly':
            const months = (endDate.getFullYear() - startDate.getFullYear()) * 12 +
                         (endDate.getMonth() - startDate.getMonth()) + 1;
            return months * singleClassMinutes;
            
        default:
            return singleClassMinutes;
    }
}

// Helper function to format minutes into hours and minutes
function formatDuration(minutes) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (hours === 0) {
        return `${remainingMinutes} minutes`;
    } else if (remainingMinutes === 0) {
        return `${hours} hour${hours > 1 ? 's' : ''}`;
    } else {
        return `${hours} hour${hours > 1 ? 's' : ''} ${remainingMinutes} minutes`;
    }
}

// Get single class by ID
router.get('/:id', async (req, res) => {
    try {
        const classItem = await Class.findById(req.params.id)
            .populate({
                path: 'trainerId',
                populate: {
                    path: 'userId',
                    select: 'name'
                }
            })
            .populate('attendees')
            .lean();

        if (!classItem) {
            return res.status(404).json({ error: 'Class not found' });
        }

        // Get trainer details
        const trainer = await Trainer.findOne({ userId: classItem.trainerId.userId._id })
            .lean();

        // Calculate duration
        const singleClassMinutes = calculateMinutesBetweenTimes(
            classItem.startTime,
            classItem.endTime
        );

        const totalMinutes = classItem.isRecurringClass
            ? calculateRecurringClassMinutes(classItem, singleClassMinutes)
            : singleClassMinutes;

        // Format the response
        const formattedResponse = {
            id: classItem._id,
            title: classItem.title,
            trainer: classItem.trainerId.userId.name,
            trainerBio: trainer ? trainer.bio : '',
            date: new Date(classItem.date).toISOString().split('T')[0],
            startTime: classItem.startTime,
            endTime: classItem.endTime,
            location: classItem.location,
            capacity: classItem.maxCapacity,
            booked: classItem.attendees.length,
            type: classItem.type.toLowerCase(),
            description: classItem.description,
            price: formatDuration(totalMinutes),
            requirements: classItem.requirements,
            isRecurringClass: classItem.isRecurringClass,
            frequency: classItem.isRecurringClass ? classItem.frequency : null,
            endDate: classItem.isRecurringClass 
                ? new Date(classItem.endDate).toISOString().split('T')[0] 
                : null
        };

        res.json(formattedResponse);

    } catch (error) {
        console.error('Error fetching class details:', error);
        res.status(500).json({ 
            error: 'Server error',
            details: error.message 
        });
    }
});


module.exports = router; 