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
 * @param {object} options
 * @param {object} [options.userInput]
 * @param {object} [options.specifications]
 * @param {function} [options.onError]
 * @param {function} [options.assign]
 */
export default function processUserInput ({ userInput, assign, specifications, onError }) {
  onError ??= (text) => { throw new Error(text) }
 
  for (const [prop, propSpecs] of Object.entries(specifications)) {
    if (prop in userInput) {
      if (
        isArray(propSpecs.type) && !propSpecs.type.some(type => TYPES[type](userInput[prop]))
        || isString(propSpecs.type) && !TYPES[propSpecs.type](userInput[prop])
      ) {
        throw new Error(`${errorPrefix} \`${prop}\` must be a ${propSpecs.type}`)
      }

      if (propSpecs.assign) {
        propSpecs.assign(prop)
      } else if (assign) {
        assign(prop)
      }
    } else if (propSpecs.required) {
      onError(`\`${prop}\` is required`)
    }
  }
}