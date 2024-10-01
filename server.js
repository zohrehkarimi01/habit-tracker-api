const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { CronJob } = require('cron');

// loads environment variables from config.env file into process.env
dotenv.config({ path: './config.env' });

process.on('uncaughtException', (err) => {
  console.log('UNCAUGHT EXCEPTION! Shutting down the server...');
  console.log(err.name, err.message);
  process.exit(1);
});

const app = require('./app');

/*
// CONNECT TO DATABASE
const DB = process.env.DATABASE.replace(
  '<PASSWORD>',
  process.env.DATABASE_PASSWORD
);
mongoose.connect(DB).then(() => {
  console.log('** DB connection successful **');
});
*/

// CONNECT TO LOCAL DATABASE
mongoose.connect(process.env.DATABASE_LOCAL).then(() => {
  console.log('** DB connection successful **');
});

CronJob.from({
  cronTime: '0 0 0 * * *',
  onTick: function () {
    console.log('cron job: schedule habit reminders');
    const Habit = mongoose.model('Habit');
    Habit.find({ reminder: { $exists: true } }).then((habits) => {
      const len = habits.length;
      for (let i = 0; i < len; i++) {
        habits[i].scheduleHabitReminder();
      }
    });
  },
  start: true,
  timeZone: 'Asia/Tehran',
});

const port = process.env.PORT || 5000;
const server = app.listen(port, () => {
  console.log(`App running on Port ${port}...`);
});

process.on('unhandledRejection', (err) => {
  console.log(err.name, ', ', err.message);
  console.log('Unhandled Rejection!! Shutting down the server...');
  server.close(() => {
    process.exit(1);
  });
});
