/**
 * Get URL clean path
 * @param {Date} date
 * @param {Date} dateToCompare
 * @return {boolean}
 */
export default function isAfterDate (date, dateToCompare) {
  return date.getTime() > dateToCompare.getTime()
}
