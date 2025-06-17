const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Booking = require('../models/Booking');
const Class = require('../models/Class');
const admin = require('../middleware/admin');
const User = require('../models/User');

/**
 * @swagger
 * components:
 *   schemas:
 *     Booking:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         className:
 *           type: string
 *         trainer:
 *           type: string
 *         date:
 *           type: string
 *           format: date
 *         startTime:
 *           type: string
 *         endTime:
 *           type: string
 *         location:
 *           type: string
 *         status:
 *           type: string
 *           enum: [upcoming, completed, cancelled]
 *         type:
 *           type: string
 *     BookingResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *         booking:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             user:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 email:
 *                   type: string
 *             class:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 title:
 *                   type: string
 *                 date:
 *                   type: string
 *                   format: date
 *                 startTime:
 *                   type: string
 *                 endTime:
 *                   type: string
 *                 isRecurringClass:
 *                   type: boolean
 *                 frequency:
 *                   type: string
 *                 endDate:
 *                   type: string
 *                   format: date
 *             minutesSpent:
 *               type: number
 *             bookedAt:
 *               type: string
 *               format: date-time
 */

/**
 * @swagger
 * /api/bookings:
 *   post:
 *     summary: Create a new booking
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - classId
 *             properties:
 *               classId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Booking created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BookingResponse'
 *       400:
 *         description: Invalid input or class is full
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Class not found
 *       500:
 *         description: Server error
 */

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
            // Calculate months difference
            const months = (endDate.getFullYear() - startDate.getFullYear()) * 12 +
                (endDate.getMonth() - startDate.getMonth()) + 1;
            return months * singleClassMinutes;

        default:
            return singleClassMinutes;
    }
}

// Create a booking
router.post('/', auth, async (req, res) => {
    try {
        const { classId } = req.body;
        const userId = req.user.id;

        // Validate if class exists
        const classDetails = await Class.findById(classId);
        if (!classDetails) {
            return res.status(404).json({ error: 'Class not found' });
        }

        // Check if user already has a booking for this class
        const existingBooking = await Booking.findOne({ userId, classId });
        if (existingBooking) {
            return res.status(400).json({ error: 'You have already booked this class' });
        }

        // Check if class is full
        if (classDetails.attendees.length >= classDetails.maxCapacity) {
            return res.status(400).json({ error: 'Class is already full' });
        }

        // Calculate single class duration in minutes
        const singleClassMinutes = calculateMinutesBetweenTimes(
            classDetails.startTime,
            classDetails.endTime
        );

        // Calculate total minutes based on whether it's a recurring class
        const totalMinutes = classDetails.isRecurringClass
            ? calculateRecurringClassMinutes(classDetails, singleClassMinutes)
            : singleClassMinutes;

        // Create the booking
        const newBooking = new Booking({
            userId,
            classId,
            minutesSpent: totalMinutes // Set the calculated minutes
        });

        // Save the booking
        await newBooking.save();

        // remove the mintes spent from the user's remaining minutes
        await User.findByIdAndUpdate(
            userId,
            { $inc: { remainingMinutes: -totalMinutes } }
        );

        // Add user to class attendees
        await Class.findByIdAndUpdate(
            classId,
            { $push: { attendees: userId } },
            { new: true }
        );

        // Get the populated booking details
        const populatedBooking = await Booking.findById(newBooking._id)
            .populate('userId', 'name email')
            .populate('classId', 'title date startTime endTime isRecurringClass frequency endDate')
            .lean();

        // Format the response
        const formattedResponse = {
            id: populatedBooking._id,
            user: {
                id: populatedBooking.userId._id,
                name: populatedBooking.userId.name,
                email: populatedBooking.userId.email
            },
            class: {
                id: populatedBooking.classId._id,
                title: populatedBooking.classId.title,
                date: new Date(populatedBooking.classId.date).toISOString().split('T')[0],
                startTime: populatedBooking.classId.startTime,
                endTime: populatedBooking.classId.endTime,
                isRecurringClass: populatedBooking.classId.isRecurringClass,
                frequency: populatedBooking.classId.frequency,
                endDate: populatedBooking.classId.endDate
                    ? new Date(populatedBooking.classId.endDate).toISOString().split('T')[0]
                    : null
            },
            minutesSpent: totalMinutes,
            bookedAt: populatedBooking.createdAt
        };

        res.status(201).json({
            message: 'Booking created successfully',
            booking: formattedResponse
        });

    } catch (error) {
        console.error('Error creating booking:', error);
        res.status(500).json({
            error: 'Server error',
            details: error.message
        });
    }
});

/**
 * @swagger
 * /api/bookings:
 *   get:
 *     summary: Get user's bookings
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user's bookings
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Booking'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */

// Get user's bookings
router.get('/', auth, async (req, res) => {
    try {
        // Get all bookings for the authenticated user
        const bookings = await Booking.find({ userId: req.user.id })
            .populate({
                path: 'classId',
                populate: {
                    path: 'trainerId',
                    populate: {
                        path: 'userId',
                        select: 'name'
                    }
                }
            })
            .lean();

        // Get current date at start of day for status comparison
        const currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0);

        // Format the response
        const formattedBookings = bookings.map(booking => {
            const classDate = new Date(booking.classId.date);
            classDate.setHours(0, 0, 0, 0);

            // Determine booking status
            let status;
            if (booking.cancelled) {
                status = 'cancelled';
            } else if (classDate < currentDate) {
                status = 'completed';
            } else {
                status = 'upcoming';
            }

            return {
                id: booking._id,
                className: booking.classId.title,
                trainer: booking.classId.trainerId.userId.name,
                date: booking.classId.date.toISOString().split('T')[0],
                startTime: booking.classId.startTime,
                endTime: booking.classId.endTime,
                location: booking.classId.location,
                status: status,
                type: booking.classId.type.toLowerCase()
            };
        });

        // Sort bookings: upcoming first, then completed, then cancelled
        formattedBookings.sort((a, b) => {
            // First sort by status
            const statusOrder = { 'upcoming': 0, 'completed': 1, 'cancelled': 2 };
            if (statusOrder[a.status] !== statusOrder[b.status]) {
                return statusOrder[a.status] - statusOrder[b.status];
            }

            // If same status, sort by date (newest first for completed/cancelled, soonest first for upcoming)
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);

            if (a.status === 'upcoming') {
                return dateA - dateB; // Ascending for upcoming
            } else {
                return dateB - dateA; // Descending for completed/cancelled
            }
        });

        res.json(formattedBookings);

    } catch (error) {
        console.error('Error fetching bookings:', error);
        res.status(500).json({
            error: 'Server error',
            details: error.message
        });
    }
});

/**
 * @swagger
 * /api/bookings/upcoming:
 *   get:
 *     summary: Get upcoming bookings
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of upcoming bookings
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   className:
 *                     type: string
 *                   trainer:
 *                     type: string
 *                   date:
 *                     type: string
 *                     format: date
 *                   startTime:
 *                     type: string
 *                   endTime:
 *                     type: string
 *                   location:
 *                     type: string
 *                   type:
 *                     type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */

// Get user's bookings
router.get('/upcoming', auth, async (req, res) => {
    try {
        // Get all bookings for the authenticated user
        let bookings = [];
        
        if (req.user.role === 'user') {
            bookings = await Booking.find({ userId: req.user.id, cancelled: { $ne: true } })
            .populate({
                path: 'classId',
                populate: {
                    path: 'trainerId',
                    populate: {
                        path: 'userId',
                        select: 'name'
                    }
                }
            })
            .lean();
        } else if (req.user.role === 'trainer') {
            bookings = await Booking.find({ cancelled: { $ne: true } })
            .populate({
                path: 'classId',
                populate: {
                    path: 'trainerId',
                    populate: {
                        path: 'userId',
                        select: 'name'
                    }
                }
            })
            .lean();
        
            // Now filter based on req.user.id
            bookings = bookings.filter(
                booking => booking.classId?.trainerId?.userId._id.toString() == req.user.id.toString()
            );
            
        } else if (req.user.role === 'admin') {
            bookings = await Booking.find({ cancelled: { $ne: true } })
            .populate({
                path: 'classId',
                populate: {
                    path: 'trainerId',
                    populate: {
                        path: 'userId',
                        select: 'name'
                    }
                }
            })
            .lean();
        }

        const currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0);

        // Format the response
        const formattedBookings = bookings
            .filter(booking => new Date(booking.classId.date) >= currentDate)
            .map(booking => {
                const classDate = new Date(booking.classId.date);
                classDate.setHours(0, 0, 0, 0);

                return {
                    id: booking._id,
                    className: booking.classId.title,
                    trainer: booking.classId.trainerId.userId.name,
                    date: booking.classId.date.toISOString().split('T')[0],
                    startTime: booking.classId.startTime,
                    endTime: booking.classId.endTime,
                    location: booking.classId.location,
                    type: booking.classId.type.toLowerCase()
                };
            });

        res.json(formattedBookings);

    } catch (error) {
        console.error('Error fetching bookings:', error);
        res.status(500).json({
            error: 'Server error',
            details: error.message
        });
    }
});

/**
 * @swagger
 * /api/bookings/admin:
 *   get:
 *     summary: Get all bookings (admin only)
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for class name, trainer, or user
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [confirmed, completed, cancelled]
 *         description: Filter by booking status
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by class type
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by date
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [date, className, trainer, user]
 *         description: Field to sort by
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *         description: Sort order
 *     responses:
 *       200:
 *         description: List of all bookings
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   className:
 *                     type: string
 *                   trainer:
 *                     type: string
 *                   user:
 *                     type: string
 *                   userEmail:
 *                     type: string
 *                   date:
 *                     type: string
 *                     format: date
 *                   startTime:
 *                     type: string
 *                   endTime:
 *                     type: string
 *                   location:
 *                     type: string
 *                   status:
 *                     type: string
 *                   type:
 *                     type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Server error
 */

// Get all bookings (admin only)
router.get('/admin', [auth, admin], async (req, res) => {
    try {
        // Get query parameters for filtering
        const { search, status, type, date, sort = 'date', order = 'desc' } = req.query;

        // Get current date at start of day
        const currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0);

        // Get all bookings with populated data
        const bookings = await Booking.find()
            .populate({
                path: 'classId',
                populate: {
                    path: 'trainerId',
                    populate: {
                        path: 'userId',
                        select: 'name'
                    }
                }
            })
            .populate('userId', 'name email')
            .lean();

        // Filter and format bookings
        let formattedBookings = bookings.map(booking => {
            const classDate = new Date(booking.classId.date);
            classDate.setHours(0, 0, 0, 0);

            // Determine booking status
            let status;
            if (booking.cancelled) {
                status = 'cancelled';
            } else if (classDate < currentDate) {
                status = 'completed';
            } else {
                status = 'confirmed';
            }

            return {
                id: booking._id,
                className: booking.classId.title,
                trainer: booking.classId.trainerId.userId.name,
                user: booking.userId.name,
                userEmail: booking.userId.email,
                date: booking.classId.date.toISOString().split('T')[0],
                startTime: booking.classId.startTime,
                endTime: booking.classId.endTime,
                location: booking.classId.location,
                status: status,
                type: booking.classId.type.toLowerCase()
            };
        });

        // Apply filters if provided
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            formattedBookings = formattedBookings.filter(booking => 
                searchRegex.test(booking.className) ||
                searchRegex.test(booking.trainer) ||
                searchRegex.test(booking.user) ||
                searchRegex.test(booking.userEmail)
            );
        }

        if (status) {
            formattedBookings = formattedBookings.filter(booking => 
                booking.status === status.toLowerCase()
            );
        }

        if (type) {
            formattedBookings = formattedBookings.filter(booking => 
                booking.type === type.toLowerCase()
            );
        }

        if (date) {
            formattedBookings = formattedBookings.filter(booking => 
                booking.date === date
            );
        }

        // Sort bookings
        formattedBookings.sort((a, b) => {
            const aValue = a[sort];
            const bValue = b[sort];

            if (sort === 'date') {
                // For date sorting, compare date and time together
                const aDateTime = `${a.date} ${a.startTime}`;
                const bDateTime = `${b.date} ${b.startTime}`;
                return order === 'asc' 
                    ? aDateTime.localeCompare(bDateTime)
                    : bDateTime.localeCompare(aDateTime);
            }

            // For other fields, do regular string comparison
            return order === 'asc'
                ? aValue.localeCompare(bValue)
                : bValue.localeCompare(aValue);
        });

        res.json(formattedBookings);

    } catch (error) {
        console.error('Error fetching bookings:', error);
        res.status(500).json({ 
            error: 'Server error',
            details: error.message 
        });
    }
});

module.exports = router; 