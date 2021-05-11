import isObject from './utils/isObject.js'
import normalizeForSearch from './utils/normalizeForSearch.js'


export default class QueryLanguage {
  static #OPERATORS = {
    $function: (storeValue, value) => value(storeValue),
    $equal: (storeValue, value) => storeValue === value,
    $notequal: (storeValue, value) => storeValue !== value,
    $in: (storeValue, value) => value.includes(storeValue),
    $notin: (storeValue, value) => !value.includes(storeValue),
    $like: (storeValue, value) => normalizeForSearch(storeValue).includes(value),
    $gt: (storeValue, value) => storeValue > value,
    $gte: (storeValue, value) => storeValue >= value,
    $lt: (storeValue, value) => storeValue < value,
    $lte: (storeValue, value) => storeValue <= value,
    $some: (storeValue, value) => storeValue && storeValue.some(item => item[value[0]] === value[1])
  }

  /**
  * Add a custom where operator
  * @param {string} operatorName - where clause
  * @param {function} operatorAction - item to compare the condition with
  * @return {void}
  */
  static addOperator (operatorName, operatorAction) {
    if (!operatorName.startsWith('$') || operatorName.length === 1) {
      throw Error('[BackInFront] An operator name must start with $')
    }

    this.#OPERATORS[operatorName] = operatorAction
  }

  /**
  * Check if the where condition is valid
  * @param {object} condition - where clause
  * @param {object} row - item to compare the condition with
  * @return {boolean}
  */
  static isConditionValid (condition, row) {
    // No condition is always valid
    if (!isObject(condition)) {
      return true
    }

    for (const conditionName in condition) {
      const conditionValue = condition[conditionName]

      // Logic operators
      if (conditionName === '$or') {
        return conditionValue.some(nestedCondition => this.isConditionValid(nestedCondition, row))
      }
      if (conditionName === '$and') {
        return conditionValue.every(nestedCondition => this.isConditionValid(nestedCondition, row))
      }

      // Support dot notation for nested field
      let storeValue
      try {
        storeValue = conditionName
          .split('.')
          .reduce((accu, current) => accu[current], row)
      } catch (error) {
        return false
      }

      // Build test
      if (isObject(conditionValue)) {
        for (const operator in conditionValue) {
          if (!this.#OPERATORS[operator](storeValue, conditionValue[operator])) {
            return false
          }
        }
        return true
      }

      // Default case is for equality check
      return this.#OPERATORS.$equal(storeValue, conditionValue)
    }

    return true
  }
}
