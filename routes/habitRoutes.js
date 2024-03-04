const express = require('express');
const habitController = require('../controllers/habitController');
const authController = require('../controllers/authController');

const router = express.Router();

router
  .route('/habit-stats')
  .get(authController.protect, habitController.getHabitStatsPerPeriod);

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
