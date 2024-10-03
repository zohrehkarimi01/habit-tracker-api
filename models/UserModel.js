const crypto = require('crypto');
const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');
const { Expo } = require('expo-server-sdk');
const AppError = require('../utils/appError');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please enter your name'],
  },
  email: {
    type: String,
    required: [true, 'Please enter your email'],
    unique: true,
    lowercase: true,
    validate: [validator.isEmail, 'Please enter a VALID email!'],
  },
  password: {
    type: String,
    required: [true, 'Please enter a password'],
    minlength: [8, 'Password must include at least 8 characters'],
    select: false,
  },
  passwordConfirm: {
    type: String,
    validate: {
      validator: function (el) {
        return el === this.password;
      },
      message: 'Passwords should be the same!',
    },
  },
  pushTokens: {
    type: [
      {
        _id: false,
        token: {
          type: String,
          required: [true, 'Please include your push token'],
          validate: {
            validator: function (token) {
              return Expo.isExpoPushToken(token);
            },
            message: 'Please enter a valid Expo push token!',
          },
        },
        lang: {
          type: String,
          required: [true, 'Please include your preferred language'],
          enum: ['en', 'fa'],
        },
        calendar: {
          type: String,
          required: [true, 'Please include your preferred calendar'],
          enum: ['gregorian', 'persian'],
        },
        issuedAt: Date,
        expires: Date,
      },
    ],
    select: false,
  },
  changedPasswordAt: Date,
  codeViaEmail: String,
  codeViaEmailExpires: Date,
  active: {
    type: Boolean,
    default: false,
  },
});
/*************** METHODS ***************/

/* 
  Method to compare if the password has changed after a 
  specific time (The time that JWT was issued)
*/
userSchema.methods.changedPasswordAfterTime = function (JWTTime) {
  if (this.changedPasswordAt) {
    const changedTimeStamp = parseInt(
      this.changedPasswordAt.getTime() / 1000,
      10
    );
    return JWTTime < changedTimeStamp;
  }
  // False means Not changed
  return false;
};

/* 
  Method to compare if the password has changed after a 
  specific date
*/
userSchema.methods.changedPasswordAfterDate = function (date) {
  if (this.changedPasswordAt) {
    return date.getTime() < this.changedPasswordAt.getTime();
  }
  // False means Not changed
  return false;
};

/*
  Method to check if the entered password
  and the actual encrypted password match
*/
userSchema.methods.correctPassword = async (candidatePassword, userPassword) =>
  await bcrypt.compare(candidatePassword, userPassword);

/* 
  Method to create a password reset token
  and save the encrypted token in database
*/
userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');

  this.passwordResetToken = crypto
    .createHash('sha256') // algorithm of hashing
    .update(resetToken) // data(token) to encrypt
    .digest('hex');

  // reset token expires after 10 minutes
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000;

  return resetToken;
};

/* 
  Method to create a verification code to send to email
*/
userSchema.methods.createVerificationCode = function () {
  const code = Math.floor(10000 + Math.random() * 90000);
  this.codeViaEmail = code;
  // verification code expiration date
  this.codeViaEmailExpires =
    Date.now() + process.env.VERIFICATION_CODE_EXPIRES_IN * 60 * 1000;
  return code;
};

/*************** MIDDLEWARES ***************/

//  Validation middlewares

/* check password confirm exists when password is updating */
userSchema.pre('save', function (next) {
  // if password is modified, check that passwordConfirm exists
  if (this.isModified('password') && !this.passwordConfirm) {
    return next(new AppError('confirm_password_required', 400));
  }
  next();
});

//  Operational middlewares

/* Encrypt password before saving it into database */
userSchema.pre('save', async function (next) {
  // Only run this function if password was actually modified
  if (!this.isModified('password')) return next();

  // Hash password with cost of 12
  this.password = await bcrypt.hash(this.password, 12);

  // Delete passwordConfirm field
  this.passwordConfirm = undefined;
  next();
});

/* Set changedPasswordAt Property when the password changes */
userSchema.pre('save', function (next) {
  if (!this.isModified('password') || this.isNew) return next();

  this.changedPasswordAt = Date.now() - 1000;
  next();
});

// If habit is deleted, delete all its logs
userSchema.pre('deleteOne', { document: true }, async function (next) {
  const Habit = mongoose.model('Habit');
  const habits = await Habit.find({ userId: this._id });
  for (let habit of habits) {
    await habit.deleteOne();
  }
  next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;
