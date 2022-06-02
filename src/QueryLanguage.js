import { isObject } from 'utililib'
import CustomError from './CustomError.js'


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
   * Check if the where condition is valid
   * @param {object} condition - where clause
   * @param {object} row - item to compare the condition with
   * @return {boolean}
   */
  static $isConditionValid (condition, row) {
    if (isObject(condition)) {
      return Object.entries(condition).every(([conditionName, conditionValue]) => {
        // Logic operators
        if (conditionName === '$or') {
          return conditionValue.some(nestedCondition => this.$isConditionValid(nestedCondition, row))
        }
        if (conditionName === '$and') {
          return conditionValue.every(nestedCondition => this.$isConditionValid(nestedCondition, row))
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
          return Object.entries(conditionValue).every(([operator, operatorValue]) => {
            return this.#OPERATORS[operator](storeValue, operatorValue)
          })
        }

        // Default case is for equality check
        return this.#OPERATORS.$equal(storeValue, conditionValue)
      })
    }

    return true
  }

  /**
   * Add a custom operator
   * @param {string} operatorName
   * @param {function} operatorAction
   */
  static addOperator (operatorName, operatorAction) {
    if (!operatorName.startsWith('$') || operatorName.length === 1) {
      throw new CustomError('operator\'s name must start with $')
    }

    this.#OPERATORS[operatorName] = operatorAction
  }
}
