const express = require('express');
const authController = require('../controllers/authController');
const habitController = require('../controllers/habitController');
const statsController = require('../controllers/statsController');

const router = express.Router();

router
  .route('/times-completed')
  .get(authController.protect, habitController.getTimesCompletedPerPeriod);

router
  .route('/stats/:id')
  .get(authController.protect, statsController.getHabitStats);

router
  .route('/')
  .post(authController.protect, habitController.createHabit)
  .get(authController.protect, habitController.getHabits);

router
  .route('/:id')
  .get(authController.protect, habitController.getHabit)
  .patch(authController.protect, habitController.updateHabit)
  .delete(authController.protect, habitController.deleteHabit);

module.exports = router;
