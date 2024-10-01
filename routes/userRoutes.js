const express = require('express');
const userController = require('../controllers/userController');
const authController = require('../controllers/authController');
const notificationController = require('../controllers/notificationController');

const router = express.Router();

/* auth routes */

router.route('/signup').post(authController.signup);
router.route('/login').post(authController.login);
router.route('/forgot-password').post(authController.forgotPassword);
router.route('/reset-password/:token').patch(authController.resetPassword);

/* user specific routes */

router
  .route('/me')
  .get(authController.protect, userController.getMe)
  .patch(authController.protect, userController.updateMe)
  .delete(authController.protect, userController.deleteMe);

router
  .route('/me/update-password')
  .patch(authController.protect, authController.updatePassword);

/* notification (push token) routes */

router
  .route('/push-tokens')
  .post(authController.protect, notificationController.registerPushToken);

router
  .route('/push-tokens/:token')
  .delete(authController.protect, notificationController.deletePushToken);

module.exports = router;
