const Log = require('../models/LogModel');
const Habit = require('../models/HabitModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const {
  getToday,
  getDateBorders,
  getDateObject,
  isBefore,
  cloneDateObject,
  isAfter,
  isValidDate,
  calculateWeekDaysBetween,
  calculateDaysBetween,
  calculateWeeksBetween,
} = require('../utils/date');

const calculateTimesCompleted = async (habit, calendarType, currentDate) => {
  // Get the current date in the chosen calendar
  const today = currentDate
    ? getDateObject(currentDate, calendarType)
    : getToday(calendarType);

  // Calculate start and end of this week, month, and year in the Gregorian calendar
  const {
    startOfWeek,
    endOfWeek,
    startOfMonth,
    endOfMonth,
    startOfYear,
    endOfYear,
  } = getDateBorders(today);

  // Calculate counts for the current week, month, and year
  const [weekCount, monthCount, yearCount, totalCount] = await Promise.all([
    habit.getTimesCompleted(startOfWeek, endOfWeek, calendarType),
    habit.getTimesCompleted(startOfMonth, endOfMonth, calendarType),
    habit.getTimesCompleted(startOfYear, endOfYear, calendarType),
    habit.getTimesCompleted(undefined, undefined, calendarType),
  ]);

  return {
    thisWeek: weekCount,
    thisMonth: monthCount,
    thisYear: yearCount,
    all: totalCount,
  };
};

const calculateMonthlyBreakdown = async (habitId, calendarType) => {
  const dateField = calendarType === 'persian' ? '$datePersian' : '$date';

  // Aggregation pipeline to sum of logs grouped by year and month
  const pipeline = [
    {
      $match: {
        habitId: habitId,
        value: { $gte: 1 },
      },
    },
    {
      $addFields: {
        year: {
          $substr: [dateField, 0, 4],
        },
        month: {
          $substr: [dateField, 5, 2],
        },
      },
    },
    {
      $group: {
        _id: {
          year: '$year',
          month: '$month',
        },
        sumOfValues: { $sum: '$value' },
      },
    },
    {
      $sort: { '_id.year': 1, '_id.month': 1 },
    },
  ];

  const aggregatedResult = await Log.aggregate(pipeline);

  if (aggregatedResult.length === 0) {
    return {};
  }

  // format aggregation result
  const formattedResult = aggregatedResult.reduce((acc, item) => {
    const year = parseInt(item._id.year);
    const month = parseInt(item._id.month);

    if (!acc[year]) {
      acc[year] = {};
    }

    acc[year][month] = item.sumOfValues;
    return acc;
  }, {});

  return formattedResult;
};

const calculateDailySuccessStats = async (habit, userDate) => {
  const today = userDate ? getDateObject(userDate) : getToday('gregorien');
  const startDate = getDateObject(habit.startDate);
  const endDate =
    !!habit.endDate && today.format('YYYY-MM-DD') > habit.endDate
      ? getDateObject(habit.endDate)
      : today;
  const currentDate = cloneDateObject(endDate);

  // if endDate is before startDate, no calculation needed
  if (isBefore(startDate, endDate)) {
    return {
      streak: 0,
      bestStreak: 0,
      success: 0,
      fail: 0,
      pending: 0,
      total: 0,
      habitScore: 0,
    };
  }

  const goalNumber = habit.type === 'boolean' ? 1 : habit.goalNumber;

  const validDays =
    habit.frequency === 'specific-days-of-week'
      ? new Set(habit.daysOfWeek)
      : new Set();

  /** calculate current streak and best streak **/

  // Fetch successful logs
  const logs = await Log.find({
    habitId: habit._id,
    value: { $gte: goalNumber },
    date: {
      $lte: endDate.format('YYYY-MM-DD'),
    },
  })
    .sort({ date: -1 })
    .select('-_id date')
    .lean();

  const logsCount = logs.length;

  let streak = 0;
  let bestStreak = 0;

  let todayLogPending = false;
  if (logsCount > 0) {
    let shouldCalculateStreak = true;
    // handle today log
    if (
      today === endDate &&
      (habit.frequency === 'every-day' ||
        validDays.has(currentDate.weekDay.shortName))
    ) {
      const todayLog = await Log.findOne({
        habitId: habit._id,
        date: today.format('YYYY-MM-DD'),
      });
      // if there is no log for today, skip this day
      if (!todayLog) {
        currentDate.subtract(1, 'day');
      } else if (todayLog.value < goalNumber) {
        if (habit.type === 'boolean')
          shouldCalculateStreak = false; // streak is zero
        else {
          todayLogPending = true;
          currentDate.subtract(1, 'day');
        }
      }
    }

    const goToPreviousValidDate =
      habit.frequency === 'specific-days-of-week'
        ? () => {
            do {
              currentDate.subtract(1, 'day');
            } while (!validDays.has(currentDate.weekDay.shortName));
          }
        : () => currentDate.subtract(1, 'day');

    if (
      habit.frequency === 'specific-days-of-week' &&
      !validDays.has(currentDate.weekDay.shortName)
    ) {
      goToPreviousValidDate();
    }

    let i = 0;
    // calculate current streak
    if (shouldCalculateStreak) {
      for (; i < logsCount; i++) {
        if (logs[i].date !== currentDate.format('YYYY-MM-DD')) {
          break; // streak breaks if there's no successful log
        }

        streak += 1;

        goToPreviousValidDate();
      }
      bestStreak = streak;
    }
    if (i < logsCount) currentDate.setDate(logs[i].date);

    // calculate best streak
    let tempStreak = 0;
    for (; i < logsCount; i++) {
      if (logs[i].date !== currentDate.format('YYYY-MM-DD')) {
        bestStreak = Math.max(bestStreak, tempStreak);
        tempStreak = 0;
        currentDate.setDate(logs[i].date);
      }

      tempStreak += 1;

      goToPreviousValidDate();
    }
    bestStreak = Math.max(bestStreak, tempStreak);
  }

  /** calculate success/fail stats **/

  const success = logsCount;
  let fail = await Log.countDocuments({
    habitId: habit._id,
    value: { $lt: goalNumber },
    date: {
      $lte: endDate.format('YYYY-MM-DD'),
    },
  });
  if (todayLogPending) fail -= 1;
  const total =
    habit.frequency === 'specific-days-of-week'
      ? calculateWeekDaysBetween(
          habit.startDate,
          endDate.format('YYYY-MM-DD'),
          habit.daysOfWeek
        )
      : calculateDaysBetween(habit.startDate, endDate.format('YYYY-MM-DD'));
  const pending = total - success - fail;
  const habitScore = Math.floor((success * 100) / Math.max(1, total));

  return { streak, bestStreak, success, fail, pending, total, habitScore };
};

const analyseLogsByWeek = async (habit, calendarType, endDate) => {
  const dailyGoal = habit.type === 'boolean' ? 1 : habit.goalNumber;
  const dateField = calendarType === 'persian' ? 'datePersian' : 'date';

  const logs = await Log.find({
    habitId: habit._id,
    value: { $gte: dailyGoal },
    [dateField]: {
      $lte: endDate.format('YYYY-MM-DD'),
    },
  })
    .sort({ [dateField]: 1 }) // old to new
    .select(`-_id ${dateField}`)
    .lean();

  if (!logs.length) return { accumulatedScore: 0, completeWeeks: [] };

  const weeklyGoal = habit.daysPerWeek;
  const completeWeeks = [];
  let score = 0;

  const endOfWeek = cloneDateObject(endDate);
  endOfWeek.setDate(logs[0][dateField]);
  const currentDate = cloneDateObject(endOfWeek);
  endOfWeek.toLastOfWeek();
  let endOfWeekStr = endOfWeek.format('YYYY-MM-DD');

  let count = 0;
  for (let i = 0, len = logs.length; i < len; i++) {
    currentDate.setDate(logs[i][dateField]);
    if (isAfter(endOfWeek, currentDate)) {
      if (count >= weeklyGoal) {
        completeWeeks.push(endOfWeekStr);
        score += weeklyGoal;
      } else {
        score += count;
      }
      // change end of week
      endOfWeek.setDate(logs[i][dateField]).toLastOfWeek();
      endOfWeekStr = endOfWeek.format('YYYY-MM-DD');
      count = 1;
    } else {
      count += 1;
    }
  }
  // last iteration check
  if (count >= weeklyGoal) {
    completeWeeks.push(endOfWeekStr);
    score += weeklyGoal;
  } else {
    score += count;
  }

  score /= weeklyGoal;

  return { accumulatedScore: score, completeWeeks };
};

const calculateWeeklySuccessStats = async (habit, calendarType, userDate) => {
  const today = userDate
    ? getDateObject(userDate, calendarType)
    : getToday(calendarType);
  const startDate = getDateObject(habit.startDate, calendarType);
  let endDate = habit.endDate
    ? getDateObject(habit.endDate, calendarType)
    : today;
  if (today.format('YYYY-MM-DD') <= endDate.format('YYYY-MM-DD'))
    endDate = today;

  // if endDate is before startDate, no calculation needed
  if (isBefore(startDate, endDate)) {
    return {};
  }

  const { completeWeeks, accumulatedScore } = await analyseLogsByWeek(
    habit,
    calendarType,
    endDate
  );

  /** calculate current streak and best streak **/

  let streak = 0;
  let bestStreak = 0;

  if (completeWeeks.length) {
    let tempStreak = 0;
    const lastWeek = getDateObject(habit.startDate, calendarType);
    lastWeek.toLastOfWeek().subtract(7, 'day'); // one week before startDate

    const len = completeWeeks.length;
    for (let i = 0; i < len; i++) {
      lastWeek.add(7, 'day'); // go to next week
      if (lastWeek.format('YYYY-MM-DD') === completeWeeks[i]) {
        // streak continues
        tempStreak += 1;
      } else {
        // streak resets
        bestStreak = Math.max(bestStreak, tempStreak);
        lastWeek.setDate(completeWeeks[i]);
        tempStreak = 1;
      }
    }

    // last iteration check
    bestStreak = Math.max(bestStreak, tempStreak);
    const finalWeek = cloneDateObject(endDate).toLastOfWeek();
    // calculate current streak
    if (finalWeek.format('YYYY-MM-DD') === completeWeeks[len - 1]) {
      streak = tempStreak;
    } else if (today === endDate) {
      finalWeek.subtract(7, 'day');
      if (finalWeek.format('YYYY-MM-DD') === completeWeeks[len - 1])
        streak = tempStreak;
    }
  }

  /** calculate success/fail stats  **/

  const totalWeeks = calculateWeeksBetween(startDate, endDate);
  const incompleteWeeks = totalWeeks - completeWeeks.length;
  const habitScore = Math.floor(
    (accumulatedScore * 100) / Math.max(totalWeeks, 1)
  );

  return {
    streak,
    bestStreak,
    completeWeeks: completeWeeks.length,
    incompleteWeeks,
    totalWeeks,
    habitScore,
  };
};

exports.getHabitStats = catchAsync(async (req, res, next) => {
  const habitId = req.params.id;
  const calendarType = req.query.calendar || 'gregorian';
  const userDate = req.query.date;

  const habit = await Habit.findById(habitId);
  if (!habit) {
    return next(new AppError('habit_not_found', 404));
  }
  if (!habit.userId.equals(req.user._id))
    return next(new AppError('no_permission_habit_access', 403));

  // check userDate is a valid date in format of YYYY-MM-DD
  if (userDate && !isValidDate(userDate)) {
    return next(new AppError('invalid_date', 400));
  }
  if (calendarType !== 'persian' && calendarType !== 'gregorian') {
    return next(new AppError('invalid_calendar', 400));
  }

  let stats = await calculateTimesCompleted(habit, calendarType, userDate);
  stats.monthlyBreakdown = await calculateMonthlyBreakdown(
    habit._id,
    calendarType
  );
  if (habit.type === 'numeric') stats.unit = habit.goalUnit;

  if (habit.frequency === 'days-per-week') {
    stats.type = 'weekly';
    const weeklyStats = await calculateWeeklySuccessStats(
      habit,
      calendarType,
      userDate
    );
    for (let field in weeklyStats) {
      stats[field] = weeklyStats[field];
    }
  } else {
    stats.type = 'daily';
    const dailyStats = await calculateDailySuccessStats(habit, userDate);
    for (let field in dailyStats) {
      stats[field] = dailyStats[field];
    }
  }

  res.status(200).json({
    status: 'success',
    data: {
      stats,
    },
  });
});
