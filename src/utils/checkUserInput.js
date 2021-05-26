import isString from './isString.js'
import isFunction from './isFunction.js'
import isArray from './isArray.js'


const typeMap = {
  string: isString,
  array: isArray,
  function: isFunction
}


/**
 * Check the existence and type validity of a user input
 * @param {object} userInput
 * @param {object} spec
 * @param {string} errorPrefix
 */
export default function checkUserInput (userInput, spec, errorPrefix='[error]') {
  for (const key in spec) {
    const paramSpec = spec[key]

    if (!(key in userInput) && paramSpec.required) {
      throw new Error(`${errorPrefix} \`${key}\` is required`)
    }
    if (key in userInput && !typeMap[paramSpec.type](userInput[key])) {
      throw new Error(`${errorPrefix} \`${key}\` must be a ${type}`)
    }
  }
}
