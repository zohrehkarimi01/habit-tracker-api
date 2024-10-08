const Habit = require('../models/HabitModel');
const Log = require('../models/LogModel');
const APIFeatures = require('../utils/apiFeatures');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

exports.createLog = catchAsync(async (req, res, next) => {
  const { habitId, value, date } = req.body;

  let log = await Log.findOne({ habitId, date }).select('+datePersian');
  if (!log) {
    // create new log
    // Attention: first parameter should be an array to pass options as second parameter
    log = await Log.create([{ habitId, value, date }], {
      userId: req.user._id,
    });
  } else {
    // update existing log
    log.value = value;
    await log.save({ userId: req.user._id });
  }

  res.status(201).json({
    status: 'success',
    data: {
      log,
    },
  });
});

exports.getLog = catchAsync(async (req, res, next) => {
  const log = await Log.findById(req.params.id);
  // check habit exists
  if (!log) return next(new AppError('log_not_found', 404));
  // check noraml user only has access to her own habit
  const { userId } = await Habit.findById(log.habitId).select('userId');
  if (!userId.equals(req.user._id))
    return next(new AppError('no_permission_log_access', 403));
  // send response
  res.status(200).json({
    status: 'success',
    data: {
      log,
    },
  });
});

exports.getLogs = catchAsync(async (req, res, next) => {
  const habitIds = await Habit.find({ userId: req.user._id }).select('habitId');
  const query = Log.find({ habitId: { $in: habitIds } });

  const features = new APIFeatures(query, req.query)
    .filter()
    .sort()
    .limitFields()
    .paginate();
  const logs = await features.query;

  // send response
  res.status(200).json({
    status: 'success',
    results: logs.length,
    data: {
      logs,
    },
  });
});

exports.updateLog = catchAsync(async (req, res, next) => {
  const { value } = req.body;
  if (!value) return next(new AppError('log_update_value_required', 400));
  // find log
  const log = await Log.findById(req.params.id).select('+datePersian');
  // check log exists
  if (!log) return next(new AppError('log_not_found', 404));
  // check noraml user only has access to her own habit
  const { userId } = await Habit.findById(log.habitId).select('userId');
  if (!userId.equals(req.user._id))
    return next(new AppError('no_permission_log_update', 403));
  log.value = value;
  await log.save({ userId: req.user._id });
  // send response
  res.status(200).json({
    status: 'success',
    data: {
      log,
    },
  });
});

exports.deleteLog = catchAsync(async (req, res, next) => {
  const log = await Log.findById(req.params.id);
  // check log exists
  if (!log) {
    return next(new AppError('log_not_found', 404));
  }
  // check user only has access to her own logs
  const { userId } = await Habit.findById(log.habitId).select('userId');
  if (!userId.equals(req.user._id))
    return next(new AppError('no_permission_log_delete', 403));
  // delete log
  await log.deleteOne();
  // send response
  res.status(204).json({
    status: 'success',
    data: null,
  });
});

exports.deleteLogByQuery = catchAsync(async (req, res, next) => {
  const { habitId, date } = req.query;
  // TODO: check habitId and date are valid
  const log = await Log.findOne({ habitId, date });
  // check log exists
  if (!log) {
    return next(new AppError('log_not_found_with_info', 404));
  }
  // check user only has access to her own logs
  const { userId } = await Habit.findById(log.habitId).select('userId');
  if (!userId.equals(req.user._id))
    return next(new AppError('no_permission_log_delete', 403));
  // delete log
  await log.deleteOne();
  // send response
  res.status(204).json({
    status: 'success',
    data: null,
  });
});
