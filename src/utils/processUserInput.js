import isString from './isString.js'
import isFunction from './isFunction.js'
import isArray from './isArray.js'
import isObject from './isObject.js'
import isBoolean from './isBoolean.js'


const TYPES = {
  array: isArray,
  function: isFunction,
  object: isObject,
  string: isString,
  boolean: isBoolean
}


/**
 * Check the existence and type validity of a user input
 * @param {object} instance
 * @param {object} userInput
 * @param {object} specifications
 * @param {string} errorPrefix
 */
export default function processUserInput ({ userInput, errorPrefix, specifications }) {
  for (const [prop, propSpecs] of Object.entries(specifications)) {
    if (prop in userInput) {
      if (
        isArray(propSpecs.type) && !propSpecs.type.every(type => TYPES[type](userInput[prop]))
        || isString(propSpecs.type) && !TYPES[propSpecs.type](userInput[prop])
      ) {
        throw new Error(`${errorPrefix} \`${prop}\` must be a ${propSpecs.type}`)
      }

      if (propSpecs.assign) {
        propSpecs.assign(prop)
      } else if (specifications.assign) {
        specifications.assign(prop)
      }
    } else if (propSpecs.required) {
      throw new Error(`${errorPrefix} \`${prop}\` is required`)
    }
  }
}