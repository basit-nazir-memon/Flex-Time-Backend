const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')
const passport = require('passport')
const session = require("express-session")
const swaggerUi = require('swagger-ui-express')
const swaggerSpecs = require('./swagger')

const authRoute = require('./routes/auth');
const classRoutes = require('./routes/classes');
const trainerRoutes = require('./routes/trainers');
const bookingRoutes = require('./routes/bookings');
const paymentRoutes = require('./routes/payments');
const dashboardRoutes = require('./routes/dashboard');
const userRoutes = require('./routes/users');
require('dotenv').config()

const app = express()

mongoose.connect(`mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@cluster0.t1ompdc.mongodb.net/${process.env.DATABASE_NAME}`, { useNewUrlParser: true })

const db = mongoose.connection;

db.on('error', console.error.bind(console, 'connection error: '));
db.once('open', ()=>{
    console.log("MongoDB Connection Successfull");
});

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(express.json());

app.use(cors());

app.use('/', authRoute);

app.use('/classes', classRoutes);

app.use('/trainers', trainerRoutes);

app.use('/bookings', bookingRoutes);

app.use('/payments', paymentRoutes);

app.use('/dashboard', dashboardRoutes);

app.use('/users', userRoutes);

// Swagger Documentation Route
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs));

app.get('/status', (req, res)=> {
    res.status(200).json({
        status: 'Up',
        frontend: process.env.FRONT_END_URL
    })
})

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Server started on port ${PORT}`));