const mongoose = require('mongoose');

const AppError = require('../utils/appError');
const {
  isValidDate,
  compareDateStrings,
  getDayOfWeek,
  getPersianDate,
} = require('../utils/date');

const logSchema = new mongoose.Schema({
  habitId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Habit',
    immutable: true,
    required: [true, 'Please enter habitId of log'],
  },
  value: {
    type: Number,
    required: [true, 'Please enter value of log'],
    min: [0, 'Minimum value for habit log is zero'],
  },
  date: {
    type: String,
    required: [true, 'Please enter date of log'],
    validate: [isValidDate, 'Entered date is not valid'],
    immutable: true,
  },
  datePersian: {
    type: String,
    select: false,
  },
});

/** MIDDLEWARES **/

// VALIDATION MIDDLEWARE
logSchema.pre('save', async function (next, options) {
  // use mongoose.model('MODELNAME') rather than requiring the model
  // in order to avoid circular dependency
  const Habit = mongoose.model('Habit');
  // fetch habit document
  const habit = await Habit.findById(this.habitId);
  // 1) check habitId is valid
  if (!habit) return next(new AppError('invalid_habit_id', 404));

  // 2) check habit belongs to current user
  if (!habit.userId.equals(options.userId))
    return next(new AppError('no_permission_log_save', 403));

  // 3) check log date is between startDate and endDate
  if (compareDateStrings(this.date, habit.startDate) === -1)
    // date is smaller than startDate
    return next(new AppError('log_before_start_date', 400));
  if (habit.endDate && compareDateStrings(this.date, habit.endDate) === 1)
    // date is bigger than endDate
    return next(new AppError('log_after_end_date', 400));

  // 4) check log date is valid for habits with specific-days-of-week frequency
  if (
    habit.frequency === 'specific-days-of-week' &&
    !habit.daysOfWeek.includes(getDayOfWeek(this.date))
  )
    return next(new AppError('log_on_invalid_day', 400));

  // 5) if habit is boolean, check value is 0 or 1
  if (habit.type === 'boolean' && this.value > 1)
    return next(new AppError('invalid_log_value_boolean', 400));
  next();
});

// add persian date to log
logSchema.pre('save', function (next) {
  if (this.isNew) {
    this.datePersian = getPersianDate(this.date);
  }
  next();
});

const Log = mongoose.model('Log', logSchema);

module.exports = Log;
