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

module.exports = {
  isValidDate,
  compareDateStrings,
};
