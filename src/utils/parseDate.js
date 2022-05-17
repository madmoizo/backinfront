/**
 * Transform a string representation of a date into a javascript Date
 * @param {string} dateString
 * @return {Date}
 */
export default function parseDate (dateString) {
  return new Date(dateString)
}
