const nodemailer = require('nodemailer');
const fs = require('fs');
const tempEmail = fs.readFileSync(
  `${__dirname}/../data/email-template.html`,
  'utf-8'
);

const sendEmail = async (options) => {
  return new Promise((resolve, reject) => {
    // 1) Create transporter
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      },
      tls: {
        // do not fail on invalid certs
        rejectUnauthorized: false,
      },
    });
    // 2) Define the email options
    const htmlToSend = tempEmail.replace('{%MESSAGE%}', options.message);
    const mailOptions = {
      from: `Habit Tracker <${process.env.EMAIL_USERNAME}>`,
      to: options.email,
      subject: options.subject,
      html: htmlToSend,
    };
    // 3) Actually send the email
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) reject(error);
      else resolve(true);
    });
  });
};

const sendVerificationEmail = async (email, code) => {
  const message =
    `<div>Verification Code: <span>${code}</span></div>` +
    `<div>This code is valid for ${process.env.VERIFICATION_CODE_EXPIRES_IN} minutes.</div>`;

  await sendEmail({
    email: email,
    subject: 'Verification Code',
    message,
  });
};

module.exports = {
  sendVerificationEmail,
};
