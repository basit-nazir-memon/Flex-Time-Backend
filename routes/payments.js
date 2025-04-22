const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Package = require('../models/Package');
const User = require('../models/User');

// Package configurations
const PACKAGES = {
    standard: {
        price: 350,
        hours: 10,
        name: 'Standard Package'
    },
    premium: {
        price: 600,
        hours: 20,
        name: 'Premium Package'
    }
};

// Create payment intent
router.post('/create-payment-intent', auth, async (req, res) => {
    try {
        const { packageType } = req.body;

        // Validate package type
        if (!PACKAGES[packageType]) {
            return res.status(400).json({ error: 'Invalid package type' });
        }

        const package = PACKAGES[packageType];

        // Create a new package record
        const newPackage = new Package({
            userId: req.user.id,
            packageType,
            amount: package.price,
            hours: package.hours,
            status: 'pending'
        });
        await newPackage.save();

        // Create payment intent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: package.price * 100, // Stripe expects amounts in cents
            currency: 'usd',
            metadata: {
                packageId: newPackage._id.toString(),
                packageType,
                userId: req.user.id
            }
        });

        // Update package with payment intent ID
        newPackage.stripePaymentIntentId = paymentIntent.id;
        await newPackage.save();

        res.json({
            clientSecret: paymentIntent.client_secret,
            packageDetails: {
                type: packageType,
                price: package.price,
                hours: package.hours,
                name: package.name
            }
        });

    } catch (error) {
        console.error('Error creating payment intent:', error);
        res.status(500).json({ error: 'Payment intent creation failed' });
    }
});

// Webhook to handle successful payments
router.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
    
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle successful payment
    if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        
        try {
            // Update package status
            const package = await Package.findOne({
                stripePaymentIntentId: paymentIntent.id
            });

            if (package) {
                package.status = 'paid';
                await package.save();

                // Update user's remaining hours
                await User.findByIdAndUpdate(
                    package.userId,
                    { $inc: { remainingHours: package.hours } }
                );
            }
        } catch (error) {
            console.error('Error processing successful payment:', error);
            return res.status(500).end();
        }
    }

    // Handle failed payment
    if (event.type === 'payment_intent.payment_failed') {
        const paymentIntent = event.data.object;
        
        try {
            await Package.findOneAndUpdate(
                { stripePaymentIntentId: paymentIntent.id },
                { status: 'failed' }
            );
        } catch (error) {
            console.error('Error processing failed payment:', error);
            return res.status(500).end();
        }
    }

    res.json({received: true});
});


// create a route that uses auth middleware and take the package detailes /payment-success
router.post('/payment-success', auth, async (req, res) => {
    try {
        const {  payment_intent_id } = req.body;
        
        const paymentIntent = await stripe.paymentIntents.retrieve( payment_intent_id);

        if (paymentIntent.status === 'succeeded') {
            const package = await Package.findOne({
                stripePaymentIntentId:  payment_intent_id
            });

            if (package) {
                package.status = 'paid';
                await package.save();
                
            }

            await User.findByIdAndUpdate(
                package.userId,
                { $inc: { remainingMinutes: package.hours * 60 } }
            );

            res.json({ success: true, message: 'Payment successful' });
        } else {
            res.status(400).json({ error: 'Payment failed' });
        }
    } catch (error) {
        console.error('Error processing payment success:', error);
        res.status(500).json({ error: 'Payment success processing failed' });
    }
});

// Get user's package purchase history
router.get('/history', auth, async (req, res) => {
    try {
        const packages = await Package.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .lean();

        const formattedPackages = packages.map(pkg => ({
            id: pkg._id,
            packageType: pkg.packageType,
            amount: pkg.amount,
            status: pkg.status,
            hours: pkg.hours,
            purchaseDate: pkg.createdAt
        }));

        res.json(formattedPackages);

    } catch (error) {
        console.error('Error fetching package history:', error);
        res.status(500).json({ error: 'Failed to fetch package history' });
    }
});

// Get user's remaining hours
router.get('/remaining-hours', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .select('remainingHours')
            .lean();

        res.json({ remainingHours: user.remainingHours });

    } catch (error) {
        console.error('Error fetching remaining hours:', error);
        res.status(500).json({ error: 'Failed to fetch remaining hours' });
    }
});

module.exports = router;
