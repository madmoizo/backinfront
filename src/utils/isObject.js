/*
 * Check if a value is an object literal
 * @param {any} value
 * @return {boolean} wether or not the value is an object
 */
export default function isObject (value) {
  return value?.constructor === Object
}
