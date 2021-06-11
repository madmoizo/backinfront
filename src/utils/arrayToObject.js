/**
 * Convert an array of objects to an object
 * @param {Array<object>} arr
 * @param {string} key
 * @return {object} hastable using key's value as identifier for each object of the arr
 */
export default function arrayToObject (arr, key) {
  return arr.reduce((obj, item) => {
    obj[item[key]] = item
    return obj
  }, {})
}
