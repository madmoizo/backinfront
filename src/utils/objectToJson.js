/**
 * Transform Date to json date
 * @param {object} obj
 * @return {object}
 */
export default function objectToJson (obj) {
  const formattedData = {}

  for (const key in obj) {
    const value = data[key]

    if (isObject(value)) {
      formattedData[key] = objectToJson(value)
    } else if (value instanceof Date) {
      formattedData[key] = value.toJSON()
    } else {
      formattedData[key] = value
    }
  }

  return formattedData
}
