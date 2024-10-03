const User = require('../models/UserModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

const filterObj = (obj, ...allowedFields) => {
  const filteredObj = {};
  Object.keys(obj).forEach((el) => {
    if (allowedFields.includes(el)) filteredObj[el] = obj[el];
  });
  return filteredObj;
};

exports.getMe = catchAsync(async (req, res, next) => {
  const { name, email } = req.user;

  res.status(200).json({
    stauts: 'success',
    data: {
      user: {
        name,
        email,
      },
    },
  });
});

exports.updateMe = catchAsync(async (req, res, next) => {
  // 1) Create error if user POSTed password data
  if (req.body.password || req.body.passwordConfirm) {
    return next(
      new AppError(
        'This route is not for updating password. Please use /me/update-password.',
        400
      )
    );
  }

  if (req.body.email) {
    return next(
      new AppError(
        "For authentication reasons, you can't change your email!",
        400
      )
    );
  }

  // 2) filter the update fields
  const filteredBody = filterObj(req.body, 'name');

  // 3) Update user document
  const updatedUser = await User.findByIdAndUpdate(req.user._id, filteredBody, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({
    stauts: 'success',
    data: {
      user: { name: updatedUser.name, email: updatedUser.email },
    },
  });
});

exports.deleteMe = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user.id);

  if (!user) return next(new AppError('User not found', 404));

  await user.deleteOne();

  res.status(204).json({
    stauts: 'success',
    data: null,
  });
});
