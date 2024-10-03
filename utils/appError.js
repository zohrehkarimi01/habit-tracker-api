class AppError extends Error {
  constructor(message, statusCode, translate = true) {
    super();

    this.message = message;
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.translate = translate;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
