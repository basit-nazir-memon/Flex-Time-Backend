const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Class = require('../models/Class');
const Booking = require('../models/Booking');
const Package = require('../models/Package');
const Trainer = require('../models/Trainer');

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
    
    return ((endHour * 60 + endMinute) - (startHour * 60 + startMinute)) / 60;
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
            return total + calculateHoursBetween(cls.startTime, cls.endTime);
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

module.exports = router; 