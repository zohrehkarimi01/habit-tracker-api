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
  const [weekCount, monthCount, yearCount] = await Promise.all([
    habit.getTimesCompleted(startOfWeek, endOfWeek, calendarType),
    habit.getTimesCompleted(startOfMonth, endOfMonth, calendarType),
    habit.getTimesCompleted(startOfYear, endOfYear, calendarType),
  ]);

  return {
    thisWeek: weekCount,
    thisMonth: monthCount,
    thisYear: yearCount,
  };
};

const calculateMonthlyBreakdown = async (habit, calendarType) => {
  // Success criteria based on habit type
  const goalNumber = habit.type === 'boolean' ? 1 : habit.goalNumber;
  const dateField = calendarType === 'persian' ? '$datePersian' : '$date';

  // Aggregation pipeline to get logs grouped by year and month
  const pipeline = [
    {
      $match: {
        habitId: habit._id,
        value: { $gte: goalNumber },
        // date: { $gte: startOfYear, $lte: endOfYear },
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
        count: { $sum: 1 },
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

  // Transform the aggregation result into the desired format
  const formattedResult = aggregatedResult.reduce((acc, item) => {
    const year = parseInt(item._id.year);
    const month = parseInt(item._id.month);

    if (!acc[year]) {
      acc[year] = {};
    }

    acc[year][month] = item.count;
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
    return {};
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
        shouldCalculateStreak = false; // streak is zero
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
  const fail = await Log.countDocuments({
    habitId: habit._id,
    value: { $lt: goalNumber },
    date: {
      $lte: endDate.format('YYYY-MM-DD'),
    },
  });
  let total =
    habit.frequency === 'specific-days-of-week'
      ? calculateWeekDaysBetween(
          habit.startDate,
          endDate.format('YYYY-MM-DD'),
          habit.daysOfWeek
        )
      : calculateDaysBetween(habit.startDate, endDate.format('YYYY-MM-DD'));
  const pending = total - success - fail;
  const habitScore = success / Math.max(1, total);

  return { streak, bestStreak, success, fail, pending, total, habitScore };
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

  const weekStart = cloneDateObject(endDate).toFirstOfWeek();
  // const weekStartFormatted = weekStart.format('YYYY-MM-DD');

  // if endDate is before startDate, no calculation needed
  if (isBefore(startDate, endDate)) {
    return {};
  }

  const dailyGoal = habit.type === 'boolean' ? 1 : habit.goalNumber;
  const weeklyGoal = habit.daysPerWeek;

  /** calculate current streak and best streak **/

  const date = calendarType === 'persian' ? 'persianDate' : 'date';

  let query = {
    
  };

  query[date] = {
    $lte: endDate.format('YYYY-MM-DD'),
  };

  // Fetch successful logs
  const logs = await Log.find({
    habitId: habit._id,
    value: { $gte: dailyGoal },
  })
    .sort({ [date]: -1 })
    .select(`-_id ${date}`)
    .lean();

  const logsCount = logs.length;

  let streak = 0;
  let bestStreak = 0;
  let completeWeeks = 0;
  let habitScore = 0;

  if (logsCount > 0) {
    let i = 0;
    let weekLogs = 0;
    const currentDate = cloneDateObject(endDate);
    // handle current week
    // current week can break streak only if there are more
    if (today === endDate) {
      for (; i < logsCount; i++) {
        currentDate.setDate(logs[i][date]);
        if (isBefore(weekStart, currentDate)) {
          if (weekLogs >= weeklyGoal) {
            streak += 1;
            completeWeeks += 1;
            weekStart.subtract(7, 'day'); // go to previous week
          } else {
            if (weekLogs > 0) habitScore += weekLogs / weeklyGoal;
            query = {
              habitId: habit._id,
              value: { $lt: dailyGoal },
            };
            query[date] = {
              $gte: weekStart.format('YYYY-MM-DD'),
              $lte: endDate.format('YYYY-MM-DD'),
            };
            const failedLogs = await Log.countDocuments(query);
            if (failedLogs > 7 - weeklyGoal) {
              streak = -1; // current streak breaks
            } else {
              weekStart.subtract(7, 'day'); // current week is ignored
            }
          }
          weekLogs = 0;
          break;
        }
        weekLogs += 1;
      }
      if (weekLogs >= weeklyGoal) {
        streak += 1;
        completeWeeks += 1;
      }
      weekLogs = 0;
    }

    // calculate current streak
    if (streak !== -1) {
      for (; i < logsCount; i++) {
        currentDate.setDate(logs[i][date]);
        if (isBefore(weekStart, currentDate)) {
          if (weekLogs >= weeklyGoal) {
            streak += 1;
            completeWeeks += 1;
            weekLogs = 0;
            weekStart.subtract(7, 'day');
            i--; // check this log again
          } else {
            if (weekLogs > 0) habitScore += weekLogs / weeklyGoal;
            break;
          }
        } else {
          weekLogs += 1;
        }
      }
      if (weekLogs >= weeklyGoal) {
        streak += 1;
        completeWeeks += 1;
      }
      weekLogs = 0;
      bestStreak = streak;
    } else {
      // current streak is zero
      streak = 0;
    }
    if (i < logsCount) weekStart.setDate(logs[i].date).toFirstOfWeek();

    // calculate best streak
    let tempStreak = 0;
    for (; i < logsCount; i++) {
      currentDate.setDate(logs[i][date]);
      if (isBefore(weekStart, currentDate)) {
        if (weekLogs >= weeklyGoal) {
          // streak continues
          tempStreak += 1;
          completeWeeks += 1;
          weekStart.subtract(7, 'day');
          weekLogs = 0;
          i--; // check this log again
        } else {
          // streak breaks
          bestStreak = Math.max(bestStreak, tempStreak);
          tempStreak = 0;
          if (weekLogs > 0) habitScore += weekLogs / weeklyGoal;
          weekStart.setDate(logs[i].date).toFirstOfWeek();
          weekLogs = 1;
        }
      } else {
        weekLogs += 1;
      }
    }
    if (weekLogs >= weeklyGoal) {
      tempStreak += 1;
      completeWeeks += 1;
    } else if (weekLogs > 0) {
      habitScore += weekLogs / weeklyGoal;
    }
    bestStreak = Math.max(bestStreak, tempStreak);
  }

  /** calculate success/fail stats  **/
  const totalWeeks = calculateWeeksBetween(startDate, endDate);
  const incompleteWeeks = totalWeeks - completeWeeks;
  habitScore = (habitScore + completeWeeks) / Math.max(totalWeeks, 1);

  return {
    streak,
    bestStreak,
    completeWeeks,
    incompleteWeeks,
    totalWeeks,
    habitScore,
  };
};

exports.getHabitStats = catchAsync(async (req, res, next) => {
  const habitId = req.params.id;
  const calendarType = req.query.calendar || 'gregorian';
  const { currentDate } = req.query;

  const habit = await Habit.findById(habitId);
  if (!habit) {
    return next(new AppError('Habit not found', 404));
  }

  // check currentDate is a valid date in format of YYYY-MM-DD
  if (currentDate && !isValidDate(currentDate)) {
    return next(new AppError('currentDate is not a valid date', 400));
  }

  let stats = await calculateTimesCompleted(habit, calendarType, currentDate);
  stats.monthlyBreakdown = await calculateMonthlyBreakdown(habit, calendarType);

  if (habit.frequency === 'days-per-week') {
    const weeklyStats = await calculateWeeklySuccessStats(
      habit,
      calendarType,
      currentDate
    );
    for (let field in weeklyStats) {
      stats[field] = weeklyStats[field];
    }
  } else {
    const dailyStats = await calculateDailySuccessStats(habit, currentDate);
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
