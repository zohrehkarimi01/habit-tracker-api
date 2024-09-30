const express = require('express');
const userController = require('../controllers/userController');
const authController = require('../controllers/authController');
const notificationController = require('../controllers/notificationController');

const router = express.Router();

router.route('/signup').post(authController.signup);
router.route('/login').post(authController.login);
router.route('/forgot-password').post(authController.forgotPassword);
router.route('/reset-password/:token').patch(authController.resetPassword);

router
  .route('/update-my-password')
  .patch(authController.protect, authController.updatePassword);

router
  .route('/update-me')
  .patch(authController.protect, userController.updateMe);
router
  .route('/delete-me')
  .delete(authController.protect, userController.deleteMe);

/* notification (push token) routes */

router
  .route('/push-tokens')
  .post(authController.protect, notificationController.registerPushToken);

router
  .route('/push-tokens/:token')
  .delete(authController.protect, notificationController.deletePushToken);

module.exports = router;
