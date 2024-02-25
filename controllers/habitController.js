const Habit = require('../models/HabitModel');
const User = require('../models/UserModel');
const APIFeatures = require('../utils/apiFeatures');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

exports.createHabit = catchAsync(async (req, res, next) => {
  const newHabit = await Habit.create({ ...req.body, userId: req.user._id });

  res.status(201).json({
    status: 'success',
    data: {
      habit: newHabit,
    },
  });
});

exports.getHabit = catchAsync(async (req, res, next) => {
  const habit = await Habit.findById(req.params.id);
  // check habit exists
  if (!habit) return next(new AppError('No habit was found with this id', 404));
  // check noraml user only has access to her own habit
  if (!habit.userId.equals(req.user._id))
    return next(
      new AppError("You don't have permission to access this habit", 403)
    );
  // send response
  res.status(200).json({
    status: 'success',
    data: {
      habit,
    },
  });
});

exports.getHabits = catchAsync(async (req, res, next) => {
  const query = Habit.find({ userId: req.user._id });

  const features = new APIFeatures(query, req.query)
    .filter()
    .sort()
    .limitFields()
    .paginate();
  const habits = await features.query;

  // send response
  res.status(200).json({
    status: 'success',
    results: habits.length,
    data: {
      habits,
    },
  });
});

exports.updateHabit = catchAsync(async (req, res, next) => {
  const habit = await Habit.findById(req.params.id);
  // check habit exists
  if (!habit) return next(new AppError('No habit was found with this id', 404));
  // check user only has access to her own habits
  if (!habit.userId.equals(req.user._id))
    return next(
      new AppError("You don't have permission to update this habit", 403)
    );
  for (field in req.body) {
    if (req.body[field] === null) habit[field] = undefined;
    else habit[field] = req.body[field];
  }
  await habit.save();
  // send response
  res.status(200).json({
    status: 'success',
    data: {
      habit: habit.toObject(),
    },
  });
});

exports.deleteHabit = catchAsync(async (req, res, next) => {
  const habit = await Habit.findById(req.params.id);
  // check habit exists
  if (!habit) {
    return next(new AppError('No habit was found with this id', 404));
  }
  // check user only has access to her own habits
  if (!habit.userId.equals(req.user._id))
    return next(
      new AppError("You don't have permission to delete this habit", 403)
    );

  // TODO: DELETE HABIT LOGS

  // delete habit
  await habit.deleteOne();
  // send response
  res.status(204).json({
    status: 'success',
    data: null,
  });
});
