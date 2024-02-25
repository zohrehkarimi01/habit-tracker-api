const mongoose = require('mongoose');
const { isValidDate, compareDateStrings } = require('../utils/date');

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
      message: 'Entered category is not valid',
    },
  },
  type: {
    type: String,
    required: [true, "Please enter habit's type"],
    enum: {
      values: ['boolean', 'numeric'],
      message: "Habit's type should be either 'boolean' or 'numeric'",
    },
    immutable: true,
  },
  /** specific to numeric habits **/
  goalNumber: {
    type: Number,
    required: isHabitNumeric,
    min: [1, 'Minimum valid value for goal number is 1'],
  },
  goalMeasure: {
    type: String,
    enum: {
      // ['>=', '=', '<'],
      values: ['at-least', 'exactly', 'less-than'],
      message: 'Entered goalMeasure is not valid',
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
      message: 'Entered habit frequency is not valid',
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
      'Please enter at least one day of week for habit',
    ],
  },
  startDate: {
    type: String,
    required: [true, "Please enter habit's start date"],
    validate: [isValidDate, 'Entered startDate is not a valid date'],
  },
  endDate: {
    type: String,
    validate: [
      {
        validator: isValidDate,
        message: 'Entered endDate is not a valid date',
      },
      {
        validator: isEndDateAfterStartDate,
        message: 'endDate must be after startDate',
      },
    ],
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

function isEndDateAfterStartDate(endDate) {
  return compareDateStrings(endDate, this.startDate) === 1;
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
