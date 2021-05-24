/**
 * Deduplicate an array of objects
 * @param {array} array
 * @param {array} uniqueKeys=[]
 * @returns {array}
 */
export function deduplicateArray (array, uniqueKeys = []) {
  return array
    .filter((value, index) => {
      return index === array.findIndex(item => {
        for (const key of uniqueKeys) {
          if (item[key] !== value[key]) {
            return false
          }
        }
        return true
      })
    })
}
