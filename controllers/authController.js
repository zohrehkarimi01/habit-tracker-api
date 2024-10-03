const { promisify } = require('util');
const jwt = require('jsonwebtoken');

const User = require('../models/UserModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const { sendVerificationEmail } = require('../utils/email');

const signToken = (id) =>
  jwt.sign({ id: id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);

  // user.password = undefined;

  const cookieOptions = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
  };
  if (process.env.NODE_ENV === 'production') cookieOptions.secure = true;

  res.cookie('jwt', token, cookieOptions);

  res.status(statusCode).json({
    status: 'success',
    token,
    expires: cookieOptions.expires,
    data: {
      user: {
        name: user.name,
        email: user.email,
      },
    },
  });
};

exports.signup = catchAsync(async (req, res, next) => {
  if (!req.body.email)
    return next(new AppError('Please include your email', 400));

  const existingUser = await User.findOne({
    email: req.body.email,
  });

  if (existingUser) {
    if (existingUser.active) {
      return next(
        new AppError(
          'Your email is already registered. please login to your account!',
          400
        )
      );
    } else {
      await existingUser.deleteOne();
    }
  }

  const user = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    passwordConfirm: req.body.passwordConfirm,
    active: false,
  });

  const code = user.createVerificationCode();
  await user.save({ validateBeforeSave: false });

  try {
    await sendVerificationEmail(user.email, code);
    res.status(200).json({
      status: 'success',
      message: 'Verification code sent to email',
      expires: user.codeViaEmailExpires,
    });
  } catch (err) {
    await user.deleteOne();
    return next(
      new AppError(
        'There was an error sending verification email. Try again later!',
        500
      )
    );
  }
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  // 1) Check if email and password exist
  if (!email || !password)
    return next(
      new AppError('The email and password should be included!', 400)
    );
  // 2) Check if user exists and password is correct
  const user = await User.findOne({ email, active: true }).select('+password');

  if (!user || !(await user.correctPassword(password, user.password)))
    return next(new AppError('Incorrect email or password!', 400)); // Unauthorized

  // 3) If everything is OK, send token to client
  createSendToken(user, 200, res);
});

exports.protect = catchAsync(async (req, res, next) => {
  // 1) Getting the token and check if it's there
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) {
    return next(
      new AppError('You are not logged in! Please log in to get access.', 401)
    );
  }
  // 2) Verification token
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  // 3) Check if user still exits
  const currentUser = await User.findById(decoded.id);
  if (!currentUser || !currentUser.active)
    return next(
      new AppError('User who owned this token does no longer exist.', 401)
    );
  // 4) Check if user changed password after the token was issued
  if (currentUser.changedPasswordAfterTime(decoded.iat)) {
    return next(
      new AppError('User recently changed password. Please log in again!', 401)
    );
  }

  // GRANT ACCESS TO PROTECTED ROUTE
  req.user = currentUser;
  req.exp = decoded.exp;
  req.iat = decoded.iat;
  next();
});

exports.forgotPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on POSTed email
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    return next(new AppError('There is no user with this email address.', 404));
  }
  // 2) Generate the random token
  const code = user.createVerificationCode();
  await user.save({ validateBeforeSave: false });

  // 3) Send it to user's email
  try {
    await sendVerificationEmail(user.email, code);

    res.status(200).json({
      status: 'success',
      message: 'Verification code sent to email',
    });
  } catch (err) {
    user.codeViaEmail = undefined;
    user.codeViaEmailExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return next(
      new AppError(
        'There was an error sending verification email. Try again later!',
        500
      )
    );
  }
});

exports.resetPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on the token
  const { email, verificationCode } = req.body;
  if (!email || !verificationCode)
    return next(
      new AppError('email and verification code should be included', 400)
    );

  const user = await User.findOne({ email });
  // 2) If token has not expired, and there is a user, set the new password
  if (!user) {
    return next(new AppError('User not found', 404));
  }
  if (!user.codeViaEmail || verificationCode !== user.codeViaEmail) {
    return next(new AppError('Verification code is not correct', 400));
  }
  if (user.codeViaEmailExpires.getTime() < Date.now()) {
    return next(new AppError('Verification code has expired', 400));
  }

  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.codeViaEmail = undefined;
  user.codeViaEmailExpires = undefined;
  await user.save();

  // 3) Update changePasswordAt property for the user
  // 4) Log the user in, send JWT
  createSendToken(user, 200, res);
});

exports.updatePassword = catchAsync(async (req, res, next) => {
  // 1) Get user from collection
  const user = await User.findById(req.user._id).select('+password');

  if (!req.body.passwordCurrent)
    return next(new AppError('Please include your current password', 400));
  // 2) Check if POSTed current password is correct
  if (!(await user.correctPassword(req.body.passwordCurrent, user.password)))
    return next(
      new AppError('The password is incorrect! please try again.', 400)
    );

  // 3) If so, update password
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  await user.save();

  // 4) Log the user in, send JWT
  createSendToken(user, 200, res);
});

exports.activateUser = catchAsync(async (req, res, next) => {
  const { email, verificationCode } = req.body;

  if (!email || !verificationCode)
    return next(
      new AppError('email and verification code should be included', 400)
    );
  const user = await User.findOne({ email });
  // check if user exists
  if (!user) return next(new AppError('User not found', 404));
  if (user.active)
    return next(
      new AppError('This account is already activated. please login!', 400)
    );

  if (!user.codeViaEmail || verificationCode !== user.codeViaEmail) {
    return next(new AppError('Verification code is incorrect', 400));
  }
  if (user.codeViaEmailExpires.getTime() < Date.now()) {
    return next(new AppError('Verification code has expired', 400));
  }

  // activate user account
  user.active = true;
  // delete code
  user.codeViaEmail = undefined;
  user.codeViaEmailExpires = undefined;
  await user.save();

  createSendToken(user, 200, res);
});
