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

module.exports = {
  isValidDate,
  compareDateStrings,
  getDayOfWeek,
};
