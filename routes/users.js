const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const admin = require('../middleware/admin'); // Assuming you have admin middleware
const User = require('../models/User');
const Package = require('../models/Package');

// Get all users (admin only)
router.get('/', [auth, admin], async (req, res) => {
    try {
        // Get query parameters for filtering
        const { search, sort = 'name', order = 'asc' } = req.query;

        // Build query
        let query = {};

        // Add search filter
        if (search) {
            query.$or = [
                { name: new RegExp(search, 'i') },
                { email: new RegExp(search, 'i') }
            ];
        }

        query.role = 'user';


        // Get all users
        const users = await User.find(query)
            .select('name email createdAt blocked remainingHours')
            .sort({ [sort]: order === 'asc' ? 1 : -1 })
            .lean();

        // Get package counts for each user
        const userIds = users.map(user => user._id);
        const packageCounts = await Package.aggregate([
            {
                $match: {
                    userId: { $in: userIds },
                    status: 'paid'
                }
            },
            {
                $group: {
                    _id: '$userId',
                    totalPackages: { $sum: 1 }
                }
            }
        ]);

        // Create a map of user ID to package count
        const packageCountMap = new Map(
            packageCounts.map(item => [item._id.toString(), item.totalPackages])
        );

        // Format the response
        const formattedUsers = users.map(user => ({
            id: user._id,
            name: user.name,
            email: user.email,
            joinDate: new Date(user.createdAt).toISOString().split('T')[0],
            hoursRemaining: user.remainingHours || 0,
            totalPackages: packageCountMap.get(user._id.toString()) || 0,
            blocked: user.blocked || false
        }));

        res.json(formattedUsers);

    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ 
            error: 'Server error',
            details: error.message 
        });
    }
});


// Update user blocked status
router.patch('/block/:userId', [auth, admin], async (req, res) => {
    try {
        const { blocked } = req.body;

        const user = await User.findByIdAndUpdate(
            req.params.userId,
            { blocked },
            { new: true }
        ).select('name email blocked');

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            message: `User ${blocked ? 'blocked' : 'unblocked'} successfully`,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                blocked: user.blocked
            }
        });

    } catch (error) {
        console.error('Error updating user blocked status:', error);
        res.status(500).json({ error: 'Server error' });
    }
});


// Get user statistics
router.get('/statistics', [auth, admin], async (req, res) => {
    try {
        const stats = await User.aggregate([
            {
                $facet: {
                    'totalUsers': [{ $count: 'count' }],
                    'blockedUsers': [
                        { $match: { blocked: true } },
                        { $count: 'count' }
                    ],
                    'activeUsers': [
                        { $match: { remainingHours: { $gt: 0 } } },
                        { $count: 'count' }
                    ]
                }
            }
        ]);

        res.json({
            totalUsers: stats[0].totalUsers[0]?.count || 0,
            blockedUsers: stats[0].blockedUsers[0]?.count || 0,
            activeUsers: stats[0].activeUsers[0]?.count || 0
        });

    } catch (error) {
        console.error('Error fetching user statistics:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router; 