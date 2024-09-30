const { Expo } = require('expo-server-sdk');
const { getSecondsTillEndOfDay } = require('./date');

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
    try {
      let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      console.log(ticketChunk);
      tickets.push(...ticketChunk);

      // Check for errors in the ticketChunk
      ticketChunk.forEach((ticket, index) => {
        if (ticket.status === 'error') {
          if (ticket.details?.error === 'DeviceNotRegistered') {
            const token = chunk[index].to;
            invalidTokens.add(token);
          }
        }
      });
    } catch (error) {
      console.error('Error sending push notifications:\n', error);
    }
  }

  return invalidTokens;
};

module.exports = {
  sendHabitNotification,
};
