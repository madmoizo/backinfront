import { isObject } from 'utililib'
import BackinfrontError from './BackinfrontError.js'


export default class QueryLanguage {
  static #OPERATORS = {
    /**
     * @param {any} storeValue
     * @param {any} value
     * @return {boolean}
     */
    $equal: (storeValue, value) => storeValue === value,
    /**
     * @param {any} storeValue
     * @param {any} value
     * @return {boolean}
     */
    $notequal: (storeValue, value) => storeValue !== value,
    /**
     * @param {any} storeValue
     * @param {any} value
     * @return {boolean}
     */
    $gt: (storeValue, value) => storeValue > value,
    /**
     * @param {any} storeValue
     * @param {any} value
     * @return {boolean}
     */
    $gte: (storeValue, value) => storeValue >= value,
    /**
     * @param {any} storeValue
     * @param {any} value
     * @return {boolean}
     */
    $lt: (storeValue, value) => storeValue < value,
    /**
     * @param {any} storeValue
     * @param {any} value
     * @return {boolean}
     */
    $lte: (storeValue, value) => storeValue <= value,
    /**
     * @param {any} storeValue
     * @param {any} value
     * @return {boolean}
     */
    $in: (storeValue, value) => value.includes(storeValue),
    /**
    * @param {any} storeValue
    * @param {any} value
    * @return {boolean}
    */
    $notin: (storeValue, value) => !value.includes(storeValue),
    /**
    * @param {any} storeValue
    * @param {any} value
    * @return {boolean}
    */
    $like: (storeValue, value) => value[0](storeValue).includes(value[0](value[1])),
    /**
     * @param {any} storeValue
     * @param {any} value
     * @return {boolean}
     */
    $some: (storeValue, value) => storeValue?.some(value) ?? false,
    /**
     * @param {any} storeValue
     * @param {any} value
     * @return {boolean}
     */
    $function: (storeValue, value) => value(storeValue)
  }

  /**
  * Add a custom where operator
  * @param {string} operatorName - where clause
  * @param {function} operatorAction - item to compare the condition with
  */
  static addOperator (operatorName, operatorAction) {
    if (!operatorName.startsWith('$') || operatorName.length === 1) {
      throw new BackinfrontError('operator\'s name must start with $')
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
