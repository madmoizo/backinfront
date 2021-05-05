/**
 * Convert an array of object to an object with an object property as key
 * @param {array} arr
 * @param {string} key
 * @return {object} hastable using key's value as identifier for each object of the arr
 */
export default function arrayToObject (arr, key) {
  return arr.reduce((obj, item) => {
    obj[item[key]] = item
    return obj
  }, {})
}
