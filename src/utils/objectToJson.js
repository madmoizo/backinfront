export default function objectToJson (object) {
  const formattedData = {}

  for (const key in object) {
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
