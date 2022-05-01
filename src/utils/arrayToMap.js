/**
 * Convert an array of objects to an object
 * @param {Array<object>} arr
 * @param {string} key
 * @return {Map} hastable using key's value as identifier for each object of the array
 */
export default function arrayToMap (arr, key) {
  const map = new Map()
  for (const item of arr) {
    map.set(item[key], item)
  }
  return map
}
