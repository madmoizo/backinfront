import { has, arrayToMap, isArray, isObject, mergeObject, typecheck } from 'utililib'
import QueryLanguage from './QueryLanguage.js'
import CustomError from './CustomError.js'


export default class Store {
  #backinfront
  storeName
  primaryKey
  indexes = {}
  beforeCreate = (data) => null

  /**
   * @param {object} backinfront
   * @param {object} options
   */
  constructor (backinfront, options = {}) {
    typecheck({
      options: {
        value: options,
        type: ['object', {
          storeName: { type: 'string', required: true },
          primaryKey: { type: 'string', required: true },
          indexes: { type: 'object' },
          beforeCreate: { type: 'function' }
        }]
      }
    })

    this.#backinfront = backinfront
    mergeObject({
      source: options,
      target: this
    })
  }

  /*****************************************************************
  * Formatting
  *****************************************************************/

  /**
   * Compare 2 arrays: remove old items, update existing items, create new items
   * @param {Array<object>} currentData
   * @param {Array<object>} newData
   * @return {Array<object>}
   */
  #updateArray (currentData, newData) {
    // TODO: find a way to not hardcode primary key 'id' (will require the store schema)
    // Create or update items
    const currentDataMap = arrayToMap(currentData, 'id')

    return newData.map(newItem => {
      const currentItem = currentDataMap.get(newItem['id'])

      return currentItem
        ? this.#updateObject(currentItem, newItem)
        : newItem
    })
  }

  /**
   * Compare object properties recusively and return a new object
   * @param {object} currentData
   * @param {object} newData
   * @return {object}
   */
  #updateObject (currentData, newData) {
    const updatedData = {}

    // Update existing keys
    for (const key in currentData) {
      const currentValue = currentData[key]
      const newValue = newData[key]

      if (newValue === undefined) {
        updatedData[key] = currentValue
      // Recursively update object
      } else if (isObject(currentValue) && isObject(newValue)) {
        updatedData[key] = this.#updateObject(currentValue, newValue)
      // Array
      } else if (isArray(currentValue) && isArray(newValue)) {
        updatedData[key] = this.#updateArray(currentValue, newValue)
      // Normal values, currentValue null
      } else {
        updatedData[key] = newValue
      }
    }

    // Add non existing keys
    for (const key in newData) {
      const currentValue = currentData[key]
      const newValue = newData[key]

      if (currentValue === undefined) {
        updatedData[key] = newValue
      }
    }

    return updatedData
  }

  /*****************************************************************
  * Public API
  *****************************************************************/

  /**
   * Count all items in the store
   * @param {IDBTransaction} [transaction=null]
   * @return {number}
   */
  async count (transaction = null) {
    const store = await this.#backinfront._openStore(this.storeName, transaction ?? 'readonly')
    const count = await store.count()
    return count
  }

  /**
   * Get all items and the count
   * @param {object} [condition] - list of filters (where, limit, offset, order)
   * @param {IDBTransaction} [transaction=null]
   * @return {object}
   */
  async findManyAndCount (condition = null, transaction = null) {
    const store = await this.#backinfront._openStore(this.storeName, transaction ?? 'readonly')

    let rows = []
    let count = 0

    if (condition) {
      const limit = parseInt(condition.limit) || null
      const offset = parseInt(condition.offset) || null

      // Initialize cursor params
      let index = store
      let direction = 'next'

      if (condition.order) {
        index = store.index(condition.order[0])

        if (condition.order[1] === 'DESC') {
          direction = 'prev'
        }
      }

      let cursor = await index.openCursor(null, direction)

      // Cursor iteration
      while (cursor) {
        if (QueryLanguage._isConditionValid(condition.where, cursor.value)) {
          count += 1

          if (
            (limit === null || limit > rows.length) &&
            (offset === null || offset < count)
          ) {
            rows.push(cursor.value)
          }
        }

        cursor = await cursor.continue()
      }
    } else {
      rows = await store.getAll()
      count = rows.length
    }

    return {
      [this.#backinfront.collectionCountKey]: count,
      [this.#backinfront.collectionDataKey]: rows
    }
  }

  /**
   * Get all items
   * @param {object} [condition=null] - list of filters (where, limit, offset, order)
   * @param {IDBTransaction} [transaction=null]
   * @return {Array<object>}
   */
  async findMany (condition = null, transaction = null) {
    const { rows } = await this.findManyAndCount(condition, transaction)
    return rows
  }

  /**
   * Get an item with a primary key
   * @param {string} primaryKeyValue
   * @param {IDBTransaction} [transaction=null]
   * @return {object}
   */
  async findOne (primaryKeyValue, transaction = null) {
    // primaryKey is a condition if it's an object
    if (isObject(primaryKeyValue)) {
      const rows = await this.findMany(primaryKeyValue, transaction)
      if (rows.length > 1) {
        throw new CustomError(`findOne: Expecting one result, ${rows.length} found`)
      }
      return rows[0]
    }

    const store = await this.#backinfront._openStore(this.storeName, transaction ?? 'readonly')
    const row = await store.get(primaryKeyValue)
    return row
  }

  /**
   * Clear the store
   * @param {IDBTransaction} [transaction=null]
   */
  async clear (transaction = null) {
    const store = await this.#backinfront._openStore(this.storeName, transaction ?? 'readwrite')
    await store.clear()
  }

  /**
   * Delete one item
   * @param {string} primaryKeyValue
   * @param {IDBTransaction} [transaction=null]
   */
  async delete (primaryKeyValue, transaction = null) {
    const store = await this.#backinfront._openStore(this.storeName, transaction ?? 'readwrite')
    await store.delete(primaryKeyValue)
  }

  /**
   * Insert a new item
   * @param {object} data
   * @param {IDBTransaction} [transaction=null]
   * @return {object}
   */
  async create (data, transaction = null) {
    let autocommit = false

    if (transaction === null) {
      transaction = await this.#backinfront._openTransaction()
      autocommit = true
    }

    const store = await this.#backinfront._openStore(this.storeName, transaction)
    // Insert the new item
    this.beforeCreate(data)
    const formattedData = this.#backinfront.formatDataBeforeSave(data)
    const savedPrimaryKeyValue = await store.add(formattedData)
    const refreshedData = await store.get(savedPrimaryKeyValue)

    await this.#backinfront._addToSyncQueue({
      storeName: this.storeName,
      primaryKey: savedPrimaryKeyValue
    }, transaction)

    // Force the commit if the function own the transaction
    if (autocommit) {
      transaction.commit?.()
    }

    return refreshedData
  }

  /**
   * Update an item (or insert if not already existing)
   * @param {string} primaryKeyValue
   * @param {object} data
   * @param {IDBTransaction} [transaction=null]
   * @return {object}
   */
  async update (primaryKeyValue, data, transaction = null) {
    let autocommit = false

    if (transaction === null) {
      transaction = await this.#backinfront._openTransaction()
      autocommit = true
    }

    const store = await this.#backinfront._openStore(this.storeName, transaction)
    // Check the consistency
    if (!has(data, this.primaryKey)) {
      throw new CustomError('update: data param must include the primaryKey')
    }
    if (primaryKeyValue !== data[this.primaryKey]) {
      throw new CustomError('update: primary key provided in `update` does not match with data')
    }
    // Compare field by field recursively
    const item = await store.get(primaryKeyValue)
    const updatedData = this.#updateObject(item, data, this.primaryKey)
    const formattedData = this.#backinfront.formatDataBeforeSave(updatedData)
    // Store the new object
    const savedPrimaryKeyValue = await store.put(formattedData)
    const refreshedData = await store.get(savedPrimaryKeyValue)

    await this.#backinfront._addToSyncQueue({
      storeName: this.storeName,
      primaryKey: savedPrimaryKeyValue
    }, transaction)

    // Force the commit if the function own the transaction
    if (autocommit) {
      transaction.commit?.()
    }

    return refreshedData
  }
}
