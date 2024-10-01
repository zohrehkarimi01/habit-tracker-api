const mongoose = require('mongoose');
const User = require('./UserModel');
const Log = require('./LogModel');
const { sendHabitNotification } = require('../utils/notification');
const {
  isValidDate,
  compareDateStrings,
  getDayOfWeek,
  getTimeDifference,
  getToday,
  getStartAndEndOfWeek,
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
      values: [
        'Quit a bad habit',
        'Health',
        'Learning',
        'Work',
        'Study',
        'Entertainment',
        'Sports',
        'Social',
        'Home',
        'Other',
      ],
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
        validator: isAfterStartDate,
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

function isAfterStartDate(endDate) {
  return compareDateStrings(endDate, this.startDate) === 1;
}

/*** METHODS ***/

habitSchema.methods.getTimesCompleted = function (
  start,
  end,
  calendarType = 'gregorian'
) {
  const query = { habitId: this._id };
  if (start && end) {
    if (calendarType === 'persian')
      query.datePersian = { $gte: start, $lte: end };
    else query.date = { $gte: start, $lte: end };
  }
  const goal = this.goalNumber || 1;
  query.value = { $gte: goal };

  return Log.countDocuments(query);
};

habitSchema.methods.shouldSendReminder = async function () {
  const today = getToday();
  const todayStr = today.format('YYYY-MM-DD');
  // check today is between startDate and endDate
  if (todayStr < this.startDate || (!!this.endDate && todayStr > this.endDate))
    return false;
  // check today is a valid weekday
  if (
    this.frequency === 'specific-days-of-week' &&
    !this.daysOfWeek.includes(today.weekDay.shortName)
  ) {
    return false;
  }
  // check habit is already done
  const dailyGoal = this.goalNumber || 1;
  const habitId = this._id;
  const successLog = await Log.findOne({
    habitId,
    date: todayStr,
    value: { $gte: dailyGoal },
  });
  if (successLog) return false;
  // check if weekly goal is met already
  if (this.frequency === 'days-per-week') {
    const weeklyGoal = this.daysPerWeek;
    const [start, end] = getStartAndEndOfWeek('gregorian');
    const weekLogsCount = await this.getTimesCompleted(start, end, 'gregorian');
    const [startPersian, endPersian] = getStartAndEndOfWeek('persian');
    const persianWeekLogsCount = await this.getTimesCompleted(
      startPersian,
      endPersian,
      'persian'
    );
    if (weekLogsCount >= weeklyGoal && persianWeekLogsCount >= weeklyGoal)
      return false;
    return {
      gregorian: weekLogsCount < weeklyGoal,
      persian: persianWeekLogsCount < weeklyGoal,
    };
  }
  return { gregorian: true, persian: true };
};

habitSchema.methods.scheduleHabitReminder = async function () {
  if (!this.reminder) return;
  const { _id: habitId } = this;
  const { _id: reminderId, hour, minute } = this.reminder;
  if (!reminderId) return;
  const timeDiff = getTimeDifference(hour, minute);
  console.log(`seconds till notification: ${timeDiff / 1000}`);
  if (timeDiff > 0) {
    setTimeout(async () => {
      try {
        console.log('notification for habitId:', habitId);
        const Habit = mongoose.model('Habit');
        // find habit
        const habit = await Habit.findById(habitId);
        // check habit exists and reminder has not changed
        if (!habit) {
          console.log('habit does not exist');
          return;
        }
        if (!reminderId.equals(habit.reminder?._id)) {
          console.log('reminder has changed!');
          return;
        }
        // find user
        const user = await User.findById(habit.userId).select('+pushTokens');
        // check there is any push token to send reminder to
        const { pushTokens } = user;
        if (!pushTokens && pushTokens.length === 0) {
          console.log('user has no push token');
          return;
        }
        // check if habit reminder should be sent for current date
        const shouldRemindUser = await habit.shouldSendReminder();
        console.log('shouldRemindUser: ', shouldRemindUser);
        if (!shouldRemindUser) {
          console.log('Habit should not send reminder');
          return;
        }
        const time = new Date().getTime();
        const filteredPushTokens = pushTokens.filter(
          ({ calendar, expires }) =>
            shouldRemindUser[calendar] && expires.getTime() > time
        );
        // send notifications
        if (filteredPushTokens.length) {
          console.log('sending notification in progress');
          const invalidTokens = await sendHabitNotification(
            filteredPushTokens,
            habit
          );
          // exclude expired and invalid tokens
          user.pushTokens = user.pushTokens.filter(
            ({ token, expires }) =>
              expires.getTime() > time && !invalidTokens.has(token)
          );
        } else {
          // exclude expired tokens
          user.pushTokens = user.pushTokens.filter(
            ({ expires }) => expires.getTime() > time
          );
        }
        await user.save();
      } catch (e) {
        console.log('error in sending reminders.\n', e);
      }
    }, timeDiff);
  }
};

/** OPERATIONAL MIDDLEWARES **/

// If habit is boolean, delete numeric related fields
habitSchema.pre('save', function (next) {
  if (this.isNew && this.type === 'boolean') {
    this.goalNumber = undefined;
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
habitSchema.pre('save', async function (next) {
  if (this.isModified('startDate')) {
    const { _id: habitId, startDate } = this;
    next();
    await Log.deleteMany({ habitId, date: { $lt: startDate } });
  } else next();
});

// If habit endDate is updated, delete logs after endDate
habitSchema.pre('save', async function (next) {
  if (this.endDate && this.isModified('endDate')) {
    const { _id: habitId, endDate } = this;
    next();
    await Log.deleteMany({ habitId, date: { $gt: endDate } });
  } else next();
});

// If frequency is updated to specific-days-of-week or daysOfWeek array is modified,
// delete irrelevant logs
habitSchema.pre('save', async function (next) {
  if (this.daysOfWeek && this.isModified('daysOfWeek')) {
    const habitId = this._id;
    const daysOfWeek = [...this.daysOfWeek];
    next();

    const logs = await Log.find({ habitId });

    for (const log of logs)
      if (!daysOfWeek.includes(getDayOfWeek(log.date))) await log.deleteOne();
  } else next();
});

// If habit reminder is modified, schedule reminder
habitSchema.pre('save', function (next) {
  if (this.isNew || this.isModified('reminder')) {
    if (this.reminder) {
      this.scheduleHabitReminder();
    }
  }
  next();
});

// If habit is deleted, delete all its logs
habitSchema.pre('deleteOne', { document: true }, async function (next) {
  const habitId = this._id.toString();
  next();
  await Log.deleteMany({ habitId });
});

const Habit = mongoose.model('Habit', habitSchema);

module.exports = Habit;
