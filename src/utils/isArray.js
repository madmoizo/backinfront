/*
 * Native function wrapper to know if a value is an array
 * @param {any} value
 * @return {boolean} wether or not the value is an array
 */
export default function isArray (value) {
  return Array.isArray(value)
}
