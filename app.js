const express = require('express');
const i18n = require('i18n');
const path = require('path');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');

const AppError = require('./utils/appError');
const globalErrorHandler = require('./controllers/errorController');
const userRouter = require('./routes/userRoutes');
const habitRouter = require('./routes/habitRoutes');
const logRouter = require('./routes/logRoutes');

const app = express();

// Configure i18n for localization
i18n.configure({
  locales: ['en', 'fa'], // English and Farsi
  directory: path.join(__dirname, 'locales'), // Directory where the translation files are located
  defaultLocale: 'en', // Default language
  autoReload: true, // Reload translations if they are modified
  syncFiles: true, // Sync missing keys in all files
  header: 'accept-language', // Use 'Accept-Language' header to determine the language
});

// Middleware to use i18n in every request
app.use(i18n.init);

// 1) GLOBAL MIDDLEWARES

// Development logging
// if (process.env.NODE_ENV === 'development') {
app.use(morgan('dev'));
// }

// Setting security HTTP headers
app.use(helmet());

// app.set('trust proxy', 'loopback, 123.123.123.123')

// Limit requests from same IP
const limiter = rateLimit({
  max: 60,
  windowMs: 60 * 1000, // 1 minutes
  message: (req, res) => res.__('too_many_requests'),
});
app.use('/api', limiter);

// Body parser, reading data from body into req.body
app.use(express.json({ limit: '10kb' }));

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// 2) ROUTES
app.use('/api/v1/users', userRouter);
app.use('/api/v1/habits', habitRouter);
app.use('/api/v1/logs', logRouter);
app.all('*', (req, res, next) => {
  next(new AppError('path_not_found', 404));
});

app.use(globalErrorHandler);

module.exports = app;
