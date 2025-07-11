const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Class = require('../models/Class');
const Booking = require('../models/Booking');
const Package = require('../models/Package');
const Trainer = require('../models/Trainer');

/**
 * @swagger
 * components:
 *   schemas:
 *     DashboardResponse:
 *       type: object
 *       properties:
 *         remainingTime:
 *           type: string
 *           description: Formatted remaining time
 *         percentageRemaining:
 *           type: number
 *           description: Percentage of package hours remaining
 *         timeTagLine:
 *           type: string
 *           description: Tagline showing package status
 *         nextClass:
 *           type: object
 *           properties:
 *             title:
 *               type: string
 *             day:
 *               type: string
 *             time:
 *               type: string
 *             trainer:
 *               type: string
 *             location:
 *               type: string
 *         upcomingClasses:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               trainer:
 *                 type: string
 *               timeLeft:
 *                 type: string
 *               time:
 *                 type: string
 *               classDuration:
 *                 type: string
 */

/**
 * @swagger
 * /api/dashboard/user:
 *   get:
 *     summary: Get user dashboard data
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User dashboard data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DashboardResponse'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */

// Helper function to format minutes into hours and minutes
function formatDuration(minutes) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (hours === 0) {
        return `${remainingMinutes} Minutes`;
    } else if (remainingMinutes === 0) {
        return `${hours} Hour${hours > 1 ? 's' : ''}`;
    } else {
        return `${hours} Hour${hours > 1 ? 's' : ''} ${remainingMinutes} Minutes`;
    }
}

// Helper function to calculate class duration
function calculateClassDuration(startTime, endTime) {
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    
    const totalMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
    return formatDuration(totalMinutes);
}

// Helper function to format relative time
function getRelativeTimeString(date) {
    const now = new Date();
    const targetDate = new Date(date);
    const diffTime = targetDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays <= 7) return `In ${diffDays} days`;
    return targetDate.toLocaleDateString();
}

// Helper function to format relative time
function formatRelativeTime(date) {
    const now = new Date();
    const diffTime = Math.abs(now - new Date(date));
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffTime / (1000 * 60));

    if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
}

// Helper function to calculate hours between times
function calculateHoursBetween(startTime, endTime) {
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    
    let totalMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
    
    // Handle case where end time is on the next day
    if (totalMinutes < 0) {
        totalMinutes += 24 * 60; // Add 24 hours worth of minutes
    }
    
    return totalMinutes / 60;
}

router.get('/user', auth, async (req, res) => {
    try {
        // Get user details with remaining hours
        const user = await User.findById(req.user.id).lean();

        // Get user's latest package
        const latestPackage = await Package.findOne({ 
            userId: req.user.id,
            status: 'paid'
        }).sort({ createdAt: -1 }).lean();

        // Get current date
        const now = new Date();

        // Get upcoming bookings
        const upcomingBookings = await Booking.find({
            userId: req.user.id,
            cancelled: { $ne: true }
        })
        .populate({
            path: 'classId',
            match: { date: { $gte: now } },
            populate: {
                path: 'trainerId',
                populate: {
                    path: 'userId',
                    select: 'name'
                }
            }
        })
        .sort({ 'classId.date': 1, 'classId.startTime': 1 })
        .lean();

        // Filter out bookings where classId is null (past classes)
        const validUpcomingBookings = upcomingBookings.filter(booking => booking.classId);

        // Format remaining time
        const remainingTime = formatDuration(user.remainingMinutes); 

        let percentageRemaining = 0;

        // Calculate time tagline
        let timeTagLine = '';
        if (latestPackage) {
            percentageRemaining = ((user.remainingMinutes / 60) / latestPackage.hours) * 100;
            timeTagLine = `${Math.round(percentageRemaining)}% of your ${latestPackage.hours}-hour package remaining`;
        }

        // Format next class
        let nextClass = null;
        if (validUpcomingBookings.length > 0) {
            const nextBooking = validUpcomingBookings[0];
            nextClass = {
                title: nextBooking.classId.title,
                day: getRelativeTimeString(nextBooking.classId.date),
                time: new Date(`2000-01-01T${nextBooking.classId.startTime}`)
                    .toLocaleTimeString('en-US', { 
                        hour: 'numeric', 
                        minute: '2-digit', 
                        hour12: true 
                    }),
                trainer: nextBooking.classId.trainerId.userId.name,
                location: nextBooking.classId.location
            };
        }

        // Format upcoming classes (next 3 excluding the very next class)
        const upcomingClasses = validUpcomingBookings
            .slice(0, 3) // Take next 3 classes after the first one
            .map(booking => ({
                title: booking.classId.title,
                trainer: booking.classId.trainerId.userId.name,
                timeLeft: getRelativeTimeString(booking.classId.date),
                time: new Date(`2000-01-01T${booking.classId.startTime}`)
                    .toLocaleTimeString('en-US', { 
                        hour: 'numeric', 
                        minute: '2-digit', 
                        hour12: true 
                    }),
                classDuration: calculateClassDuration(
                    booking.classId.startTime,
                    booking.classId.endTime
                )
            }));

        res.json({
            remainingTime,
            percentageRemaining,
            timeTagLine,
            nextClass,
            upcomingClasses
        });

    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        res.status(500).json({ 
            error: 'Server error',
            details: error.message 
        });
    }
});

/**
 * @swagger
 * /api/dashboard/trainer:
 *   get:
 *     summary: Get trainer dashboard data
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Trainer dashboard data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 todaysClasses:
 *                   type: number
 *                 nextClassIn:
 *                   type: string
 *                 totalStudents:
 *                   type: number
 *                 lastWeekStudentChange:
 *                   type: string
 *                 hoursTaughtThisMonth:
 *                   type: number
 *                 upcomingClassesInNext7Days:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       classTitle:
 *                         type: string
 *                       classDay:
 *                         type: string
 *                       time:
 *                         type: string
 *                       location:
 *                         type: string
 *                       totalCapacity:
 *                         type: number
 *                       bookedCapacity:
 *                         type: number
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/trainer', auth, async (req, res) => {
    try {
        // First, get trainer details
        const trainer = await Trainer.findOne({ userId: req.user.id });
        if (!trainer) {
            return res.status(404).json({ error: 'Trainer not found' });
        }

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);

        // Get last week's date
        const lastWeek = new Date(today);
        lastWeek.setDate(lastWeek.getDate() - 7);

        // Get first day of current month
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // Get all classes for today
        const todaysClasses = await Class.countDocuments({
            trainerId: trainer._id,
            date: {
                $gte: today,
                $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
            }
        });

        // Get next class
        const nextClass = await Class.findOne({
            trainerId: trainer._id,
            date: { $gte: now }
        })
        .sort({ date: 1, startTime: 1 })
        .lean();

        // Calculate next class in hours
        let nextClassIn = '';
        if (nextClass) {
            const classDateTime = new Date(nextClass.date);
            const [hours, minutes] = nextClass.startTime.split(':');
            classDateTime.setHours(parseInt(hours), parseInt(minutes));
            const hoursUntilClass = Math.ceil((classDateTime - now) / (1000 * 60 * 60));
            nextClassIn = `${hoursUntilClass} hours`;
        }

        // Get total unique students
        const totalStudents = await Booking.distinct('userId', {
            'classId': { 
                $in: await Class.find({ trainerId: trainer._id }).distinct('_id') 
            }
        }).then(students => students.length);

        // Get last week's student count for comparison
        const lastWeekStudents = await Booking.distinct('userId', {
            'classId': {
                $in: await Class.find({
                    trainerId: trainer._id,
                    date: { $gte: lastWeek, $lt: today }
                }).distinct('_id')
            }
        }).then(students => students.length);

        const studentChange = totalStudents - lastWeekStudents;

        // Calculate hours taught this month
        const monthClasses = await Class.find({
            trainerId: trainer._id,
            date: { $gte: firstDayOfMonth, $lt: now }
        }).lean();

        const hoursTaughtThisMonth = monthClasses.reduce((total, cls) => {
            const hours = calculateHoursBetween(cls.startTime, cls.endTime);
            return total + (hours > 0 ? hours : 0); // Ensure we don't add negative hours
        }, 0);

        // Get upcoming classes for next 7 days
        const upcomingClasses = await Class.find({
            trainerId: trainer._id,
            date: { $gte: today, $lt: nextWeek }
        })
        .sort({ date: 1, startTime: 1 })
        .lean();

        // Get recent students
        const recentBookings = await Booking.find({
            'classId': { 
                $in: await Class.find({ trainerId: trainer._id }).distinct('_id') 
            }
        })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('userId', 'name avatar')
        .populate('classId', 'title')
        .lean();

        // Format the response
        const formattedResponse = {
            todaysClasses,
            nextClassIn,
            totalStudents,
            lastWeekStudentChange: studentChange > 0 ? `+${studentChange}` : studentChange.toString(),
            hoursTaughtThisMonth: Math.round(hoursTaughtThisMonth),
            upcomingClassesInNext7Days: upcomingClasses.map(cls => ({
                classTitle: cls.title,
                classDay: new Date(cls.date).toDateString() === today.toDateString() ? 'Today' : 
                          new Date(cls.date).toDateString() === new Date(today.getTime() + 24 * 60 * 60 * 1000).toDateString() ? 'Tomorrow' :
                          new Date(cls.date).toLocaleDateString('en-US', { weekday: 'long' }),
                time: new Date(`2000-01-01T${cls.startTime}`).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                }),
                location: cls.location,
                totalCapacity: cls.maxCapacity,
                bookedCapacity: cls.attendees.length
            })),
            recentStudents: recentBookings.map(booking => ({
                avatar: booking.userId.avatar,
                name: booking.userId.name,
                classBookedIn: booking.classId.title,
                classBooked: formatRelativeTime(booking.createdAt)
            }))
        };

        res.json(formattedResponse);

    } catch (error) {
        console.error('Error fetching trainer dashboard data:', error);
        res.status(500).json({ 
            error: 'Server error',
            details: error.message 
        });
    }
});

/**
 * @swagger
 * /api/dashboard/admin:
 *   get:
 *     summary: Get admin dashboard data
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Admin dashboard data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalUsers:
 *                   type: number
 *                 totalTrainers:
 *                   type: number
 *                 totalClasses:
 *                   type: number
 *                 totalBookings:
 *                   type: number
 *                 upcomingClasses:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       title:
 *                         type: string
 *                       date:
 *                         type: string
 *                       startTime:
 *                         type: string
 *                       endTime:
 *                         type: string
 *                       location:
 *                         type: string
 *                       trainer:
 *                         type: string
 *                       enrolledUsers:
 *                         type: number
 *                       maxCapacity:
 *                         type: number
 *                 recentBookings:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       className:
 *                         type: string
 *                       userName:
 *                         type: string
 *                       date:
 *                         type: string
 *                       status:
 *                         type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/admin', auth, async (req, res) => {
    try {
        // Get total counts
        const totalUsers = await User.countDocuments();
        const totalTrainers = await Trainer.countDocuments();
        const totalClasses = await Class.countDocuments();
        const totalBookings = await Booking.countDocuments();

        // Get upcoming classes (next 7 days)
        const now = new Date();
        const nextWeek = new Date(now);
        nextWeek.setDate(nextWeek.getDate() + 7);

        const upcomingClasses = await Class.find({
            date: { $gte: now, $lte: nextWeek }
        })
        .populate('trainerId', 'userId')
        .populate({
            path: 'trainerId',
            populate: {
                path: 'userId',
                select: 'name'
            }
        })
        .sort({ date: 1, startTime: 1 })
        .lean();

        // Format upcoming classes
        const formattedUpcomingClasses = upcomingClasses.map(cls => ({
            id: cls._id.toString(),
            title: cls.title,
            date: cls.date.toISOString().split('T')[0],
            startTime: cls.startTime,
            endTime: cls.endTime,
            location: cls.location,
            trainer: cls.trainerId.userId.name,
            enrolledUsers: cls.attendees.length,
            maxCapacity: cls.maxCapacity
        }));

        // Get recent bookings
        const recentBookings = await Booking.find()
            .sort({ createdAt: -1 })
            .limit(10)
            .populate('userId', 'name')
            .populate('classId', 'title date')
            .lean();

        // Format recent bookings
        const formattedRecentBookings = recentBookings.map(booking => ({
            id: booking._id.toString(),
            className: booking.classId.title,
            userName: booking.userId.name,
            date: booking.classId.date.toISOString().split('T')[0],
            status: booking.cancelled ? 'cancelled' : 'confirmed'
        }));

        res.json({
            totalUsers,
            totalTrainers,
            totalClasses,
            totalBookings,
            upcomingClasses: formattedUpcomingClasses,
            recentBookings: formattedRecentBookings
        });

    } catch (error) {
        console.error('Error fetching admin dashboard data:', error);
        res.status(500).json({ 
            error: 'Server error',
            details: error.message 
        });
    }
});

module.exports = router; 