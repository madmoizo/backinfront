export default function isAfterDate (date, dateToCompare) {
  return date.getTime() > dateToCompare.getTime()
}
