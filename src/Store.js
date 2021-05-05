import QueryLanguage from './QueryLanguage.js'

import isObject from './utils/isObject.js'
import isArray from './utils/isArray.js'
import arrayToObject from './utils/arrayToObject.js'


class Store {
  #storize

  /*****************************************************************
  * Formatting
  *****************************************************************/

  /**
  * Format data before insertion into indexedDB
  * @param {object} data
  */
  #formatBeforeInsertion (data) {
    const formattedData = {}

    for (const key in data) {
      const value = data[key]

      if (isObject(value)) {
        formattedData[key] = this.#formatBeforeInsertion(value)
      } else if (value instanceof Date) {
        formattedData[key] = value.toJSON()
      } else {
        formattedData[key] = value
      }
    }

    return formattedData
  }

  /**
  * Compare 2 arrays: remove old items, update existing items, create new items
  * @param {array} currentData
  * @param {array} newData
  */
  #updateArrays (currentData, newData) {
    // Create or update items
    const currentDataIds = arrayToObject(currentData, this.primaryKey)

    return newData.map(newItem => {
      const newItemId = newItem[this.primaryKey]
      const currentItem = currentDataIds[newItemId]

      return currentItem
        ? this.#updateObjects(currentItem, newItem)
        : newItem
    })
  }

  /**
  * Compare object properties recusively and return a new object
  * @param {object} currentData
  * @param {object} newData
  */
  #updateObjects (currentData, newData) {
    const updatedData = {}

    // Update existing keys
    for (const key in currentData) {
      const currentValue = currentData[key]
      const newValue = newData[key]

      if (newValue === undefined) {
        updatedData[key] = currentValue
      // Recursively update object
      } else if (isObject(currentValue) && isObject(newValue)) {
        updatedData[key] = this.#updateObjects(currentValue, newValue)
      // Array
      } else if (isArray(currentValue) && isArray(newValue)) {
        updatedData[key] = this.#updateArrays(currentValue, newValue)
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

  constructor (storize, options = {}) {
    if (!options.storeName) {
      throw new Error('[BackInFront] `storeName` is required')
    }
    if (!options.primaryKey) {
      throw new Error(`[BackInFront] \`primaryKey\` is required on store ${options.storeName}`)
    }
    if (!options.endpoint) {
      throw new Error(`[BackInFront] \`endpoint\` is required on store ${options.storeName}`)
    }

    // Required options
    this.#storize = storize
    this.storeName = options.storeName
    this.primaryKey = options.primaryKey
    this.endpoint = options.endpoint
    this.beforeCreate = options.beforeCreate
      ? options.beforeCreate
      : () => null

    // default
    this.routes = []

    // Register manual routes
    if (options.routes) {
      for (const route of options.routes) {
        this.addRoute(route)
      }
    }

    // Register predefined routes
    if (options.autoroutes) {
      const predefinedRoutes = {
        'create': {
          method: 'POST',
          pathname: '/',
          action: async ({ body, transaction }) => {
            return this.create(body, transaction)
          }
        },
        'list': {
          method: 'GET',
          pathname: '/',
          action: async () => {
            return this.findAndCountAll()
          }
        },
        'retrieve': {
          method: 'GET',
          pathname: '/:primaryKey',
          action: async ({ pathParams }) => {
            return this.findOne(pathParams.primaryKey)
          }
        },
        'update': {
          method: 'PUT',
          pathname: '/:primaryKey',
          action: async ({ pathParams, body, transaction }) => {
            return this.update(pathParams.primaryKey, body, transaction)
          }
        }
      }

      for (const autoroute of options.autoroutes) {
        this.addRoute(predefinedRoutes[autoroute])
      }
    }

    return this
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

  /**
  * Count all items in the store
  */
  async count (transaction = null) {
    const store = await this.#storize.openStore(this.storeName, 'readonly', transaction)
    const count = await store.count()
    return count
  }

  /**
  * Get all items and the count
  * @param {object} condition - list of filters (where, limit, offset, order)
  */
  async findAndCountAll (condition = null) {
    const store = await this.#storize.openStore(this.storeName, 'readonly')

    if (!condition) {
      const rows = await store.getAll()
      const count = rows.length

      return {
        count,
        rows
      }
    }

    // Format condition members
    const limit = parseInt(condition.limit) || null
    const offset = parseInt(condition.offset) || null

    let count = 0
    let added = 0

    const rows = await this.#storize.iterate(store, condition.order, (row) => {
      // Where
      if (!QueryLanguage.isConditionValid(condition.where, row)) {
        return false
      }

      count += 1

      // Offset
      if (offset >= count) {
        return false
      }
      // Limit
      if (limit === added) {
        return false
      }

      added += 1

      return true
    })

    return {
      count,
      rows
    }
  }

  /**
  * Get all items
  * @param {object} condition - list of filters (where, limit, offset, order)
  */
  async findAll (condition = null) {
    const { rows } = await this.findAndCountAll(condition)
    return rows
  }

  /**
  * Get an item with a primary key
  * @param {string} primaryKey
  */
  async findOne (primaryKey, transaction = null) {
    // primaryKey is a condition if it's an object
    if (isObject(primaryKey)) {
      const rows = await this.findAll(primaryKey)
      if (rows.length > 1) {
        throw new Error(`[BackInFront][findOne] Expecting one result, ${rows.length} found`)
      }
      return rows[0]
    }

    const store = await this.#storize.openStore(this.storeName, 'readonly', transaction)
    const row = await store.get(primaryKey)
    return row
  }

  /**
  * Clear the store
  */
  async clear (transaction = null) {
    const store = await this.#storize.openStore(this.storeName, 'readwrite', transaction)
    await store.clear()
  }

  /**
  * Destroy one item
  * @param {string} primaryKey
  */
  async destroy (primaryKey, transaction = null) {
    const store = await this.#storize.openStore(this.storeName, 'readwrite', transaction)
    await store.delete(primaryKey)
  }

  /**
  * Insert a new item
  * @param {object} data
  */
  async create (data, transaction = null) {
    let autocommit = false

    if (transaction === null) {
      transaction = await this.#storize.getTransaction('readwrite', [this.storeName, this.#storize.syncQueueStoreName])
      autocommit = true
    }

    const store = await this.#storize.openStore(this.storeName, 'readwrite', transaction)
    // Insert the new item
    await this.beforeCreate({ data, transaction }, this.#storize.stores)
    const formattedData = this.#formatBeforeInsertion(data)
    const savedPrimaryKey = await store.add(formattedData)

    await this.#storize.addToSyncQueue(this.storeName, savedPrimaryKey, transaction)

    // Force commit if the function own the transaction
    if (autocommit && 'commit' in transaction) {
      transaction.commit()
    }

    return store.get(savedPrimaryKey)
  }

  /**
  * Update an item (or insert if not already existing)
  * @param {string} primaryKey
  * @param {object} data
  */
  async update (primaryKey, data, transaction = null) {
    let autocommit = false

    if (transaction === null) {
      transaction = await this.#storize.getTransaction('readwrite', [this.storeName, this.#storize.syncQueueStoreName])
      autocommit = true
    }

    const store = await this.#storize.openStore(this.storeName, 'readwrite', transaction)
    // Check the consistency
    if (
      store.keyPath in data &&
      primaryKey !== data[store.keyPath]
    ) {
      throw new Error('[BackInFront] primaryKey provided in `update` is different from the keyPath found in data')
    }
    // Compare field by field recursively
    const item = await store.get(primaryKey)
    const updatedData = this.#updateObjects(item, data)
    const formattedData = this.#formatBeforeInsertion(updatedData)
    // Store the new object
    const savedPrimaryKey = await store.put(formattedData)

    await this.#storize.addToSyncQueue(this.storeName, savedPrimaryKey, transaction)

    // Force commit if the function own the transaction
    if (autocommit && 'commit' in transaction) {
      transaction.commit()
    }

    return store.get(savedPrimaryKey)
  }
}


export default Store
