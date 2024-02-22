const mongoose = require('mongoose');
const dotenv = require('dotenv');

// loads environment variables from config.env file into process.env
dotenv.config({ path: './config.env' });

process.on('uncaughtException', (err) => {
  console.log('UNCAUGHT EXCEPTION! 💥 Shutting down the server...');
  console.log(err.name, err.message);
  process.exit(1);
});

const app = require('./app');

// CONNECT TO LOCAL DATABASE
mongoose.connect(process.env.DATABASE_LOCAL).then(() => {
  console.log('✅ DB connection successful');
});

const port = process.env.PORT || 5000;
const server = app.listen(port, () => {
  console.log(`App running on Port ${port}...`);
});

process.on('unhandledRejection', (err) => {
  console.log(err.name, ', ', err.message);
  console.log('Unhandled Rejection!! Shutting down the server...');
  server.close(() => {
    process.exit(1);
  });
});
