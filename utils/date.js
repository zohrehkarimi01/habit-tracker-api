function compareDates(date1, date2) {
  // compare dates
  return date1.getTime() > date2.getTime()
    ? 1
    : date1.getTime() === date2.getTime()
    ? 0
    : -1;
}

module.exports = {
  compareDates,
};
