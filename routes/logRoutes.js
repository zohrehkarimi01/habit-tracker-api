const express = require('express');
const logController = require('../controllers/logController');
const authController = require('../controllers/authController');

const router = express.Router();

router
  .route('/')
  .post(authController.protect, logController.createLog)
  .get(authController.protect, logController.getLogs)
  .delete(authController.protect, logController.deleteLogByQuery);

router
  .route('/:id')
  .get(authController.protect, logController.getLog)
  .patch(authController.protect, logController.updateLog)
  .delete(authController.protect, logController.deleteLog);

module.exports = router;
