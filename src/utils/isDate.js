export default function isDate (value) {
  return value instanceof Date && !Number.isNaN(value.valueOf())
}
