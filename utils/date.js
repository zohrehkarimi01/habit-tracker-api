const { default: DateObject } = require('react-date-object');
const persian = require('react-date-object/calendars/persian');
const persian_en = require('react-date-object/locales/persian_en');

function isValidDate(dateString) {
  var regEx = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateString.match(regEx)) return false; // Invalid format
  // date-only form is interpreted as UTC time
  var date = new Date(dateString);
  var time = date.getTime();
  if (!time && time !== 0) return false; // NaN value, Invalid date
  return date.toISOString().slice(0, 10) === dateString;
}

function compareDateStrings(dateStr1, dateStr2) {
  const date1 = new Date(dateStr1);
  const date2 = new Date(dateStr2);
  // compare dates
  return date1.getTime() > date2.getTime()
    ? 1
    : date1.getTime() === date2.getTime()
    ? 0
    : -1;
}

function getDayOfWeek(dateStr) {
  const date = new Date(dateStr);
  switch (date.getUTCDay()) {
    case 0:
      return 'Sun';
    case 1:
      return 'Mon';
    case 2:
      return 'Tue';
    case 3:
      return 'Wed';
    case 4:
      return 'Thu';
    case 5:
      return 'Fri';
    case 6:
      return 'Sat';
    default:
      return undefined;
  }
}

/**
 * get time diffrence between current time and given hour and minute
 * @param {0-23} hour
 * @param {0-59} minute
 * @returns time difference in milliseconds
 */
function getTimeDifference(hour, minute) {
  const now = new Date();
  const targetTime = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hour,
    minute
  );

  return targetTime.getTime() - now.getTime();
}

/**
 * get number of seconds untill the end of today
 * @returns number
 */
function getSecondsTillEndOfDay() {
  const now = new Date();
  const endOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59
  );

  return Math.ceil((endOfDay.getTime() - now.getTime()) / 1000);
}

/**
 * convert gregorian date to persian date
 * @param {String} dateStr date string
 * @returns {string} persian date string in YYYY-MM-DD format
 */
function getPersianDate(dateStr) {
  const date = new DateObject(dateStr);
  date.convert(persian, persian_en);
  return date.format('YYYY-MM-DD');
}

/**
 * get date object from date string
 * @param {String} dateStr gregorian date string in YYYY-MM-DD format
 * @param {'persian'|'gregorian'} calendarType type of calendar to use for date object
 * @returns {DateObject} date object
 */
function getDateObject(dateStr, calendarType = 'gregorian') {
  const date = new DateObject(dateStr);
  if (calendarType === 'persian') {
    date.convert(persian, persian_en);
  }
  return date;
}

function cloneDateObject(dateObject) {
  return new DateObject(dateObject);
}

function getToday(calendarType = 'gregorian') {
  const date =
    calendarType === 'persian'
      ? new DateObject({ calendar: persian, locale: persian_en })
      : new DateObject();

  date.setHour(0);
  date.setMinute(0);
  date.setSecond(0);
  date.setMillisecond(0);

  return date;
}

function getStartAndEndOfWeek(calendar) {
  const today = getToday(calendar);
  const startOfWeek = today.toFirstOfWeek().format('YYYY-MM-DD');
  const endOfWeek = today.toLastOfWeek().format('YYYY-MM-DD');

  return [startOfWeek, endOfWeek];
}

function getDateBorders(date) {
  const dateBorders = {};

  let dateObj = new DateObject(date);
  dateBorders.startOfWeek = dateObj.toFirstOfWeek().format('YYYY-MM-DD');
  dateBorders.endOfWeek = dateObj.toLastOfWeek().format('YYYY-MM-DD');
  dateObj = new DateObject(date);
  dateBorders.startOfMonth = dateObj.toFirstOfMonth().format('YYYY-MM-DD');
  dateBorders.endOfMonth = dateObj.toLastOfMonth().format('YYYY-MM-DD');
  dateBorders.startOfYear = dateObj.toFirstOfYear().format('YYYY-MM-DD');
  dateBorders.endOfYear = dateObj.toLastOfYear().format('YYYY-MM-DD');

  return dateBorders;
}

/**
 * calculates number of days between two dates (including them)
 * @param {string} startDate date string in format of YYYY-MM-DD (gregorian only)
 * @param {string} endDate date string in format of YYYY-MM-DD (gregorian only)
 * @returns number of days between startDate and endDate
 */
function calculateDaysBetween(startDate, endDate) {
  // Convert the input strings to Date objects, in UTC to avoid timezone issues
  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');

  return Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * calculates number of specific days between two dates
 * @param {string} startDate date string in format of YYYY-MM-DD (gregorian only)
 * @param {string} endDate date string in format of YYYY-MM-DD (gregorian only)
 * @param {Array} array of week day names like Sun, Mon, Tue, etc.
 * @returns number of days between startDate and endDate
 */
function calculateWeekDaysBetween(startDate, endDate, weekdays) {
  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');

  const dayOfWeekMap = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const targetDays = weekdays.map((day) => dayOfWeekMap[day]);
  const totalDays = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;

  const fullWeeks = Math.floor(totalDays / 7);
  const remainingDays = totalDays % 7;

  let count = fullWeeks * targetDays.length;

  let currentDate = new Date(start);
  for (let i = 0; i < remainingDays; i++) {
    const currentDay = (currentDate.getUTCDay() + i) % 7;
    if (targetDays.includes(currentDay)) {
      count++;
    }
  }

  return count;
}

/**
 * calculates number of weeks between two dates
 * @param {DateObject} startDate
 * @param {DateObject} endDate
 * @returns number of weeks between startDate and endDate
 */
function calculateWeeksBetween(startDate, endDate) {
  const start = new DateObject(startDate).toFirstOfWeek();
  const end = new DateObject(endDate).toLastOfWeek();

  const totalDays = (end.valueOf() - start.valueOf()) / (1000 * 60 * 60 * 24);

  return Math.ceil(totalDays / 7);
}
/**
 * checks if dates are equal
 * @param {DateObject} date1
 * @param {DateObject} date2
 * @returns {Boolean}
 */
function isSame(date1, date2) {
  if (!date1 || !date2) return false;

  return (
    date1.year === date2.year &&
    date1.monthIndex === date2.monthIndex &&
    date1.day === date2.day
  );
}

/**
 * checks if date is after current date
 * @param {DateObject} current
 * @param {DateObject} date
 * @returns {Boolean}
 */
function isAfter(current, date) {
  if (current.year < date.year) return true;
  if (current.year === date.year) {
    if (current.monthIndex < date.monthIndex) return true;
    if (current.monthIndex === date.monthIndex && current.day < date.day)
      return true;
  }
  return false;
}

/**
 * checks if date is before current date
 * @param {DateObject} current
 * @param {DateObject} date
 * @returns {Boolean}
 */
function isBefore(current, date) {
  if (current.year > date.year) return true;
  if (current.year === date.year) {
    if (current.monthIndex > date.monthIndex) return true;
    if (current.monthIndex === date.monthIndex && current.day > date.day)
      return true;
  }
  return false;
}

module.exports = {
  DateObject,
  isValidDate,
  compareDateStrings,
  getDayOfWeek,
  getTimeDifference,
  getSecondsTillEndOfDay,
  getPersianDate,
  getDateObject,
  cloneDateObject,
  getToday,
  getStartAndEndOfWeek,
  getDateBorders,
  calculateDaysBetween,
  calculateWeekDaysBetween,
  calculateWeeksBetween,
  isSame,
  isBefore,
  isAfter,
};
