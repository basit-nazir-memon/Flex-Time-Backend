const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Flex Time API Documentation',
            version: '1.0.0',
            description: 'API documentation for Flex Time application',
        },
        servers: [
            {
                url: 'https://flex-time-backend.onrender.com',
                description: 'Production Server',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
            schemas: {
                Package: {
                    type: 'object',
                    properties: {
                        userId: { type: 'string' },
                        packageType: { type: 'string', enum: ['standard', 'premium'] },
                        amount: { type: 'number' },
                        hours: { type: 'number' },
                        status: { type: 'string', enum: ['pending', 'paid', 'failed'] },
                        stripePaymentIntentId: { type: 'string' }
                    }
                },
                PaymentIntent: {
                    type: 'object',
                    properties: {
                        clientSecret: { type: 'string' },
                        packageDetails: {
                            type: 'object',
                            properties: {
                                type: { type: 'string' },
                                price: { type: 'number' },
                                hours: { type: 'number' },
                                name: { type: 'string' }
                            }
                        }
                    }
                },
                Class: {
                    type: 'object',
                    properties: {
                        title: { type: 'string' },
                        date: { type: 'string', format: 'date' },
                        type: { type: 'string' },
                        startTime: { type: 'string' },
                        endTime: { type: 'string' },
                        location: { type: 'string' },
                        maxCapacity: { type: 'number' },
                        description: { type: 'string' },
                        requirements: { type: 'string' },
                        isRecurringClass: { type: 'boolean' },
                        frequency: { 
                            type: 'string',
                            enum: ['Daily', 'Weekly', 'Bi-weekly', 'Monthly']
                        },
                        endDate: { type: 'string', format: 'date' }
                    }
                },
                ClassResponse: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        title: { type: 'string' },
                        date: { type: 'string' },
                        startTime: { type: 'string' },
                        endTime: { type: 'string' },
                        location: { type: 'string' },
                        capacity: { type: 'number' },
                        booked: { type: 'number' },
                        type: { type: 'string' },
                        trainer: { type: 'string' },
                        status: { type: 'string', enum: ['completed', 'upcoming'] }
                    }
                },
                ClassDetailResponse: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        title: { type: 'string' },
                        trainer: { type: 'string' },
                        trainerBio: { type: 'string' },
                        date: { type: 'string' },
                        startTime: { type: 'string' },
                        endTime: { type: 'string' },
                        location: { type: 'string' },
                        capacity: { type: 'number' },
                        booked: { type: 'number' },
                        type: { type: 'string' },
                        description: { type: 'string' },
                        price: { type: 'string' },
                        requirements: { type: 'string' },
                        isRecurringClass: { type: 'boolean' },
                        frequency: { type: 'string' },
                        endDate: { type: 'string' }
                    }
                }
            }
        },
        security: [{
            bearerAuth: [],
        }],
    },
    apis: ['./routes/*.js'], // Path to the API routes
};

const specs = swaggerJsdoc(options);

module.exports = specs; 