/**
 * Deduplicate an array of objects
 * @param {Array<object>} arr
 * @param {Array<string>} [uniqueKeys=[]]
 * @return {Array<object>}
 */
export default function deduplicateArray (arr, uniqueKeys = []) {
  return arr
    .filter((value, index) => {
      return index === arr.findIndex(item => {
        for (const key of uniqueKeys) {
          if (item[key] !== value[key]) {
            return false
          }
        }
        return true
      })
    })
}
