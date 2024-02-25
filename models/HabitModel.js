const mongoose = require('mongoose');
const { compareDates } = require('../utils/date');

// name, photo, email, password, passeordConfirm
const habitSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    immutable: true,
  },
  name: {
    type: String,
    required: [true, "Please enter habit's name"],
  },
  category: {
    type: String,
    required: [true, "Please enter habit's category"],
    enum: {
      values: ['Study', 'Work', 'Health', 'Entertainment', 'Social', 'Other'],
      message: 'Entered category is not valid!',
    },
  },
  type: {
    type: String,
    required: [true, "Please enter habit's type"],
    enum: {
      values: ['boolean', 'numeric'],
      message: "Habit's type should be either 'boolean' or 'numeric'!",
    },
    immutable: true
  },
  /** specific to numeric habits **/
  goalNumber: {
    type: Number,
    required: isHabitNumeric,
    min: [1, 'Minimum valid value for goal number is 1!'],
  },
  goalMeasure: {
    type: String,
    enum: {
      // ['>=', '=', '<'],
      values: ['at-least', 'exactly', 'less-than'],
      message: 'Entered goalMeasure is not valid!',
    },
    required: isHabitNumeric,
  },
  goalUnit: {
    type: String,
    required: isHabitNumeric,
  },
  /**/
  frequency: {
    type: String,
    enum: {
      values: ['every-day', 'days-per-week', 'specific-days-of-week'],
      message: 'Entered habit frequency is not valid!',
    },
    required: [true, "Please enter habit's frequency"],
  },
  daysPerWeek: {
    type: Number,
    required: isDaysPerWeekRequired,
  },
  daysOfWeek: {
    type: [
      { type: String, enum: ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'] },
    ],
    default: undefined,
    required: isDaysOfWeekRequired,
    validate: [
      function (val) {
        return val.length > 0 && val.length < 7;
      },
      'Please enter at least one day of week for habit.',
    ],
  },
  startDate: {
    type: Date,
    required: [true, "Please enter habit's start date"],
  },
  endDate: {
    type: Date,
    validate: [isEndDateValid, 'End date must be after start date.'],
  },
  reminder: {
    type: {
      hour: Number,
      minute: Number,
    },
  },
});

/** VALIDATION FUNCTIONS **/
function isDaysPerWeekRequired() {
  return this.frequency === 'days-per-week';
}

function isDaysOfWeekRequired() {
  return this.frequency === 'specific-days-of-week';
}

function isHabitNumeric() {
  return this.type === 'numeric';
}

function isEndDateValid(endDate) {
  // check that endDate is after startDate
  const startDate = new Date(this.startDate);
  startDate.setHours(startDate.getHours() + 48);
  return compareDates(startDate, endDate) === -1;
}

/** MIDDLEWARES **/

// If habit is boolean, delete numeric related fields
habitSchema.pre('save', function (next) {
  if (this.isNew || this.isModified('type')) {
    if (this.type === 'boolean') {
      this.goalNumber = undefined;
      this.goalMeasure = undefined;
      this.goalUnit = undefined;
    }
  }
  next();
});

// delete redundent frequency related fields
habitSchema.pre('save', function (next) {
  if (this.isNew || this.isModified('frequency')) {
    if (this.frequency === 'every-day') {
      this.daysPerWeek = undefined;
      this.daysOfWeek = undefined;
    } else if (this.frequency === 'days-per-week') this.daysOfWeek = undefined;
    else if (this.frequency === 'specific-days-of-week')
      this.daysPerWeek = undefined;
  }
  next();
});

const Habit = mongoose.model('Habit', habitSchema);

module.exports = Habit;
