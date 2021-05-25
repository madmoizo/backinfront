import QueryLanguage from './QueryLanguage.js'

import isObject from './utils/isObject.js'
import isArray from './utils/isArray.js'
import arrayToObject from './utils/arrayToObject.js'


export default class Store {
  #backinfront
  storeName
  primaryKey
  indexes = {}
  endpoint
  routes = []
  beforeCreate = (data) => null

  constructor (backinfront, options = {}) {
    this.#backinfront = backinfront

    if (options.storeName) {
      this.storeName = options.storeName
    } else {
      throw new Error('[Backinfront] `storeName` is required')
    }
    if (options.primaryKey) {
      this.primaryKey = options.primaryKey
    } else {
      throw new Error(`[Backinfront] \`primaryKey\` is required on store ${options.storeName}`)
    }
    if (options.endpoint) {
      this.endpoint = options.endpoint
    } else {
      throw new Error(`[Backinfront][router] \`endpoint\` is required`)
    }

    if (options.indexes) {
      this.indexes = options.indexes
    }
    if (options.beforeCreate) {
      this.beforeCreate = options.beforeCreate
    }

    // Register manual routes
    if (options.routes) {
      const predefinedRoutes = {
        'create': {
          method: 'POST',
          pathname: '/',
          action: async ({ body, transaction }, stores) => {
            return stores[this.storeName].create(body, transaction)
          }
        },
        'list': {
          method: 'GET',
          pathname: '/',
          action: async (ctx, stores) => {
            return stores[this.storeName].findAndCountAll()
          }
        },
        'retrieve': {
          method: 'GET',
          pathname: '/:primaryKey',
          action: async ({ pathParams }, stores) => {
            return stores[this.storeName].findOne(pathParams.primaryKey)
          }
        },
        'update': {
          method: 'PUT',
          pathname: '/:primaryKey',
          action: async ({ pathParams, body, transaction }, stores) => {
            return stores[this.storeName].update(pathParams.primaryKey, body, transaction)
          }
        }
      }

      for (const route of options.routes) {
        if (isObject(route)) {
          this.addRoute(route)
        } else {
          this.addRoute(predefinedRoutes[route])
        }
      }
    }
  }

  /**
  * Add a route to the global list
  * @param {string} method
  * @param {string} pathname
  * @param {function} action
  */
  addRoute ({ method, pathname, action }) {
    this.routes.push({
      method: method.toUpperCase(),
      pathname: pathname,
      action: action
    })
  }

  /*****************************************************************
  * Formatting
  *****************************************************************/

  /**
  * Compare 2 arrays: remove old items, update existing items, create new items
  * @param {array} currentData
  * @param {array} newData
  */
  #updateArray (currentData, newData) {
    // TODO: find a way to not hardcode primary key 'id' (will require the store schema)
    // Create or update items
    const currentDataIds = arrayToObject(currentData, 'id')

    return newData.map(newItem => {
      const newItemId = newItem['id']
      const currentItem = currentDataIds[newItemId]

      return currentItem
        ? this.#updateObject(currentItem, newItem)
        : newItem
    })
  }

  /**
  * Compare object properties recusively and return a new object
  * @param {object} currentData
  * @param {object} newData
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
  * @param {IDBTransaction} transaction
  */
  async count (transaction = null) {
    const store = await this.#backinfront.openStore(this.storeName, 'readonly', transaction)
    const count = await store.count()
    return count
  }

  /**
  * Get all items and the count
  * @param {object} condition - list of filters (where, limit, offset, order)
  */
  async findAndCountAll (condition = null) {
    const store = await this.#backinfront.openStore(this.storeName, 'readonly')

    if (!condition) {
      const rows = await store.getAll()
      const count = rows.length

      return {
        rows,
        count
      }
    }

    const limit = parseInt(condition.limit) || null
    const offset = parseInt(condition.offset) || null
    const rows = []
    let count = 0

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
      if (QueryLanguage.isConditionValid(condition.where, cursor.value)) {
        count += 1

        if (
          (limit === null || rows.length < limit) &&
          (offset === null || count > offset)
        ) {
          rows.push(cursor.value)
        }
      }

      cursor = await cursor.continue()
    }

    return {
      rows,
      count
    }
  }

  /**
  * Get all items
  * @param {object} condition - list of filters (where, limit, offset, order)
  * @return {array}
  */
  async findAll (condition = null) {
    const { rows } = await this.findAndCountAll(condition)
    return rows
  }

  /**
  * Get an item with a primary key
  * @param {string} primaryKeyValue
  * @return {object}
  */
  async findOne (primaryKeyValue, transaction = null) {
    // primaryKey is a condition if it's an object
    if (isObject(primaryKeyValue)) {
      const rows = await this.findAll(primaryKeyValue)
      if (rows.length > 1) {
        throw new Error(`[Backinfront][findOne] Expecting one result, ${rows.length} found`)
      }
      return rows[0]
    }

    const store = await this.#backinfront.openStore(this.storeName, 'readonly', transaction)
    const row = await store.get(primaryKeyValue)
    return row
  }

  /**
  * Clear the store
  * @param {IDBTransaction} transaction
  */
  async clear (transaction = null) {
    const store = await this.#backinfront.openStore(this.storeName, 'readwrite', transaction)
    await store.clear()
  }

  /**
  * Destroy one item
  * @param {string} primaryKeyValue
  * @param {IDBTransaction} transaction
  */
  async destroy (primaryKeyValue, transaction = null) {
    const store = await this.#backinfront.openStore(this.storeName, 'readwrite', transaction)
    await store.delete(primaryKeyValue)
  }

  /**
  * Insert a new item
  * @param {object} data
  * @param {IDBTransaction} transaction
  */
  async create (data, transaction = null) {
    let autocommit = false

    if (transaction === null) {
      transaction = await this.#backinfront.getTransaction('readwrite', [this.storeName, this.#backinfront.syncQueueStoreName])
      autocommit = true
    }

    const store = await this.#backinfront.openStore(this.storeName, 'readwrite', transaction)
    // Insert the new item
    this.beforeCreate(data)
    const formattedData = this.#backinfront.formatDataBeforeSave(data)
    const savedPrimaryKeyValue = await store.add(formattedData)

    await this.#backinfront.addToSyncQueue(this.storeName, savedPrimaryKeyValue, transaction)

    // Force commit if the function own the transaction
    if (autocommit) {
      transaction.commit?.()
    }

    return store.get(savedPrimaryKeyValue)
  }

  /**
  * Update an item (or insert if not already existing)
  * @param {string} primaryKeyValue
  * @param {object} data
  * @param {IDBTransaction} transaction
  */
  async update (primaryKeyValue, data, transaction = null) {
    let autocommit = false

    if (transaction === null) {
      transaction = await this.#backinfront.getTransaction('readwrite', [this.storeName, this.#backinfront.syncQueueStoreName])
      autocommit = true
    }

    const store = await this.#backinfront.openStore(this.storeName, 'readwrite', transaction)
    // Check the consistency
    if (this.primaryKey in data) {
      throw new Error('[Backinfront][update] data param must include the primaryKey')
    }
    if (primaryKeyValue !== data[this.primaryKey]) {
      throw new Error('[Backinfront][update] primary key provided in `update` does not match with data')
    }
    // Compare field by field recursively
    const item = await store.get(primaryKeyValue)
    const updatedData = this.#updateObject(item, data, this.primaryKey)
    const formattedData = this.#backinfront.formatDataBeforeSave(updatedData)
    // Store the new object
    const savedPrimaryKeyValue = await store.put(formattedData)

    await this.#backinfront.addToSyncQueue(this.storeName, savedPrimaryKeyValue, transaction)

    // Force commit if the function own the transaction
    if (autocommit) {
      transaction.commit?.()
    }

    return store.get(savedPrimaryKeyValue)
  }
}
