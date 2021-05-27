/**
 * Transform Date to json date
 * @param {object} obj
 * @return {object}
 */
export default function dateToJson (obj) {
  const formattedData = {}

  for (const key in obj) {
    const value = obj[key]

    if (isObject(value)) {
      formattedData[key] = dateToJson(value)
    } else if (value instanceof Date) {
      formattedData[key] = value.toJSON()
    } else {
      formattedData[key] = value
    }
  }

  return formattedData
}
