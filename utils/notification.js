const { Expo } = require('expo-server-sdk');
const { getSecondsTillEndOfDay } = require('./date');

const delayPromise = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const sendWithRetry = async (expo, chunk, retries = 5, delay = 1000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      console.log('Success on attempt', attempt, ticketChunk);
      return ticketChunk; // Success, return the result
    } catch (error) {
      console.error(`Error on attempt ${attempt}:`, error.message);
      if (
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.message.includes('Client network socket disconnected')
      ) {
        if (attempt < retries) {
          console.log(`Retrying after ${delay}ms...`);
          await delayPromise(delay);
          delay = delay * 2;
        } else {
          console.error('Max retries reached, notification failed.');
        }
      } else {
        // If it's not a network error, break the retry loop and reject
        console.error('Non-retriable error:', error.message);
        break;
      }
    }
  }
  return []; // Return an empty array if the request ultimately fails
};

const sendHabitNotification = async (pushTokenItems, habit) => {
  const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN });
  const ttl = Math.max(getSecondsTillEndOfDay(), 3600);
  const data = {
    en: {
      title: 'Habit Reminder',
      body:
        habit.name +
        (habit.type === 'numeric'
          ? `, ${habit.goalNumber} ${habit.goalUnit}`
          : ''),
    },
    fa: {
      title: 'یادآور عادت',
      body:
        habit.name +
        (habit.type === 'numeric'
          ? `، ${habit.goalNumber} ${habit.goalUnit}`
          : ''),
    },
  };

  const messages = [];
  for (let item of pushTokenItems) {
    const { lang, token } = item;
    messages.push({
      to: token,
      title: data[lang].title,
      body: data[lang].body,
      priority: 'high',
      ttl,
    });
  }

  let chunks = expo.chunkPushNotifications(messages);
  let tickets = [];
  let invalidTokens = new Set();

  for (let chunk of chunks) {
    const ticketChunk = await sendWithRetry(expo, chunk);
    console.log(ticketChunk);
    tickets.push(...ticketChunk);

    // Check for errors in the ticketChunk
    ticketChunk.forEach((ticket, index) => {
      if (
        ticket.status === 'error' &&
        ticket.details?.error === 'DeviceNotRegistered'
      ) {
        const token = chunk[index].to;
        invalidTokens.add(token);
      }
    });
  }

  return invalidTokens;
};

module.exports = {
  sendHabitNotification,
};
