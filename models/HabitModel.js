const mongoose = require('mongoose');
const Log = require('./LogModel');
const {
  isValidDate,
  compareDateStrings,
  getDayOfWeek,
} = require('../utils/date');

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
    required: [isHabitNumeric, "Please enter habit's daily goalNumber"],
    min: [1, 'Minimum valid value for goal number is 1'],
  },
  goalMeasure: {
    type: String,
    enum: {
      // ['>=', '=', '<'],
      values: ['at-least', 'exactly'],
      message: 'Entered goalMeasure is not valid',
    },
    required: [isHabitNumeric, "Please enter habit's goalMeasure"],
  },
  goalUnit: {
    type: String,
    required: [isHabitNumeric, "Please enter habit's goalUnit"],
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
    required: [
      isDaysPerWeekRequired,
      'Please enter number of days per week that habit should be done',
    ],
    min: [1, 'Minimum valid value for daysPerWeek is 1'],
    max: [6, 'Maximum valid value for daysPerWeek is 6'],
  },
  daysOfWeek: {
    type: [
      { type: String, enum: ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'] },
    ],
    default: undefined,
    required: [
      isDaysOfWeekRequired,
      'Please enter list of week days that habit should be done',
    ],
    validate: [
      {
        validator: function (val) {
          return new Set(val).size === val.length;
        },
        message: 'Entered days of week has duplicate values',
      },
      {
        validator: function (val) {
          return val.length > 0 && val.length < 7;
        },
        message: 'Please enter between one to six days of week for this habit',
      },
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
      hour: {
        type: Number,
        min: [0, 'Entered value for reminder hour is not valid'],
        max: [23, 'Entered value for reminder hour is not valid'],
      },
      minute: {
        type: Number,
        min: [0, 'Entered value for reminder minute is not valid'],
        max: [59, 'Entered value for reminder minute is not valid'],
      },
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

/** OPERATIONAL MIDDLEWARES **/

// If habit is boolean, delete numeric related fields
habitSchema.pre('save', function (next) {
  if (this.isNew && this.type === 'boolean') {
    this.goalNumber = undefined;
    this.goalMeasure = undefined;
    this.goalUnit = undefined;
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

// If habit startDate is updated, delete logs before startDate
habitSchema.pre('save', { document: true }, async function (next) {
  if (this.isModified('startDate')) {
    const { _id: habitId, startDate } = this;
    next();
    await Log.deleteMany({ habitId, date: { $lt: startDate } });
  } else next();
});

// If habit endDate is updated, delete logs after endDate
habitSchema.pre('save', { document: true }, async function (next) {
  if (this.endDate && this.isModified('endDate')) {
    const { _id: habitId, endDate } = this;
    next();
    await Log.deleteMany({ habitId, date: { $gt: endDate } });
  } else next();
});

// If frequency is updated to specific-days-of-week or daysOfWeek array is modified,
// delete irrelevant logs
habitSchema.pre('save', { document: true }, async function (next) {
  if (this.daysOfWeek && this.isModified('daysOfWeek')) {
    const habitId = this._id;
    const daysOfWeek = [...this.daysOfWeek];
    next();

    const logs = await Log.find({ habitId });

    for (const log of logs)
      if (!daysOfWeek.includes(getDayOfWeek(log.date))) await log.deleteOne();
  } else next();
});

// If habit is deleted, delete all its logs
habitSchema.pre('deleteOne', { document: true }, async function (next) {
  const habitId = this._id.toString();
  next();
  const results = await Log.deleteMany({ habitId });
  console.log(results);
});

habitSchema.methods.getHabitStats = function (start, end) {
  const query = { habitId: this._id, date: { $gte: start, $lte: end } };
  const goal = this.goalNumber || 1;
  if (this.goalMeasure === 'exactly') query.value = goal;
  else query.value = { $gte: goal };
  
  return Log.countDocuments(query);
};

const Habit = mongoose.model('Habit', habitSchema);

module.exports = Habit;
