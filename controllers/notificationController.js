const User = require('../models/UserModel');
const catchAsync = require('../utils/catchAsync');

exports.registerPushToken = catchAsync(async (req, res, next) => {
  const { token, lang, calendar } = req.body;

  const user = await User.findById(req.user.id).select('+pushTokens');

  if (!user.pushTokens) user.pushTokens = [];

  // Find existing pushToken
  const existingToken = user.pushTokens.find((t) => t.token === token);

  if (existingToken) {
    // Update the existing token
    existingToken.lang = lang;
    existingToken.calendar = calendar;
    existingToken.issuedAt = new Date(req.iat * 1000);
    existingToken.expires = new Date(req.exp * 1000);
  } else {
    // Add new token to the pushTokens array
    user.pushTokens.push({
      token,
      lang,
      calendar,
      issuedAt: new Date(req.iat * 1000),
      expires: new Date(req.exp * 1000),
    });
  }

  await user.save();
  res.status(201).json({
    status: 'success',
    message: 'Push token added successfully',
  });
});

exports.deletePushToken = catchAsync(async (req, res, next) => {
  const { token } = req.params;

  const user = await User.findById(req.user.id).select('+pushTokens');

  if (user.pushTokens?.length) {
    // Filter out the token to be removed
    const initLen = user.pushTokens.length;
    user.pushTokens = user.pushTokens.filter((t) => t.token !== token);

    if (user.pushTokens.length < initLen) {
      await user.save();

      return res.status(200).json({
        status: 'success',
        message: 'Push token deleted successfully.',
      });
    }
  }

  res.status(200).json({
    status: 'success',
    message: 'Token not found, nothing to delete.',
  });
});
