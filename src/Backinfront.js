import { openDB, deleteDB } from 'idb'

import QueryLanguage from './QueryLanguage.js'
import Store from './Store.js'
import Router from './Router.js'

import isDate from './utils/isDate.js'
import isString from './isString.js'
import isFunction from './isFunction.js'
import isArray from './isArray.js'
import isObject from './isObject.js'
import isBoolean from './isBoolean.js'
import parseDate from './utils/parseDate.js'
import isAfterDate from './utils/isAfterDate.js'
import getUrlPath from './utils/getUrlPath.js'
import generateUUID from './utils/generateUUID.js'
import waitUntil from './utils/waitUntil.js'
import deduplicateArray from './utils/deduplicateArray.js'


const TYPES = {
  array: isArray,
  function: isFunction,
  object: isObject,
  string: isString,
  boolean: isBoolean
}

const ROUTE_ERRORS = {
  'NOT_FOUND': {
    status: 404,
    statusText: 'Not found'
  },
  'ACTION_ERROR': {
    status: 500,
    statusText: 'Action error'
  }
}

const DB_OPERATIONS = {
  /**
     * @param {IDBTransaction} transaction
     * @param {object} options
     * @param {string} options.storeName
     * @param {string} options.keyPath
     */
  createStore (transaction, { storeName, keyPath }) {
    transaction.db.createObjectStore(storeName, { keyPath }) // nullish keyPath is ignored
  },
  /**
   * @param {IDBTransaction} transaction
   * @param {object} options
   * @param {string} options.storeName
   */
  deleteStore (transaction, { storeName }) {
    transaction.db.deleteObjectStore(storeName)
  },
  /**
   * @param {IDBTransaction} transaction
   * @param {object} options
   * @param {string} options.storeName
   * @param {string} options.indexName
   * @param {string} options.indexKeyPath
   */
  createIndex (transaction, { storeName, indexName, indexKeyPath }) {
    transaction.objectStore(storeName).createIndex(indexName, indexKeyPath)
  },
  /**
   * @param {IDBTransaction} transaction
   * @param {object} options
   * @param {string} options.storeName
   * @param {string} options.indexName
   */
  deleteIndex (transaction, { storeName, indexName }) {
    transaction.objectStore(storeName).deleteIndex(indexName)
  }
}


export default class Backinfront {
  #databaseConfigurationStarted = false
  #databaseConfigurationEnded = false
  #syncInProgress = false
  #metadataStoreName = '__Metadata'
  #syncQueueStoreName = '__SyncQueue'
  #databaseSchema = {
    [this.#metadataStoreName]: {
      keyPath: null
    },
    [this.#syncQueueStoreName]: {
      keyPath: 'id',
      indexes: {
        createdAt: 'createdAt'
      }
    }
  }
  routes = []
  stores = {}
  authentication = false
  routeState = () => null
  formatRouteSearchParam = (value) => value
  formatRoutePathParam = (value) => value
  onRouteError = () => null
  onRouteSuccess = () => null
  onPopulateSuccess = () => null
  onPopulateError = () => null
  onSyncSuccess = () => null
  onSyncError = () => null
  formatDataBeforeSave = (data) => JSON.parse(JSON.stringify(data)) // by default, easiest way to convert Date to json & clean an object  
  
  /**
   * Check the existence and type validity of a user input
   * @param {object} userInput
   * @param {object} specifications
   * @param {string} errorPrefix
   */
  #processUserInput ({ userInput, errorPrefix, specifications }) {
    for (const [prop, propSpecs] of Object.entries(specifications)) {
      // Optionnal options
      if (prop in userInput) {
        if (
          isArray(propSpecs.type) && !propSpecs.type.every(type => TYPES[type](userInput[prop]))
          || isString(propSpecs.type) && !TYPES[propSpecs.type](userInput[prop])
        ) {
          throw new Error(`${errorPrefix} \`${prop}\` must be a ${propSpecs.type}`)
        }

        if (propSpecs.assign !== false) {
          this[prop] = userInput[prop]
        }
      } else {
        if (propSpecs.required) {
          throw new Error(`${errorPrefix} \`${prop}\` is required`)
        }
      }
    }
  }


  /**
  * @constructor
  * @param {object} options
  * @param {string} options.databaseName
  * @param {Array<object>} options.stores - list of store's configurations
  * @param {Array<object>} options.router - list of store's configurations
  * @param {false | function} options.authentication - must return a JWT to authenticate populate & sync requests
  * @param {string} options.populateUrl - part of url corresponding to the populate endpoint
  * @param {string} [options.syncUrl] - part of url corresponding to the sync endpoint
  * @param {function} [options.routeState] - must return an object with data available on every offline handled requests
  * @param {function} [options.formatDataBeforeSave] - format data before insertion into indexeddb
  * @param {function} [options.formatRouteSearchParam] - format Request's search params (example: transform comma separated string into array)
  * @param {function} [options.formatRoutePathParam] - format Route's customs params
  * @param {function} [options.onRouteSuccess]
  * @param {function} [options.onRouteError]
  * @param {function} [options.onPopulateSuccess]
  * @param {function} [options.onPopulateError]
  * @param {function} [options.onSyncSuccess]
  * @param {function} [options.onSyncError]
  */
  constructor (options = {}) {
    // Throw an error if user input does not match the spec
    this.#processUserInput({
      userInput: options,
      errorPrefix: '[Backinfront]',
      specifications: {
        databaseName: { type: 'string', required: true },
        syncUrl: { type: 'string', required: true },
        populateUrl: { type: 'string', required: true },
        stores: { type: 'array', required: true, assign: false }, // Store and router required a specific processing
        routers: { type: 'array', required: true, assign: false },
        authentication: { type: ['function', 'boolean'] },
        routeState: { type: 'function' },
        formatDataBeforeSave: { type: 'function' },
        formatRouteSearchParam: { type: 'function' },
        formatRoutePathParam: { type: 'function' },
        onRouteSuccess: { type: 'function' },
        onRouteError: { type: 'function' },
        onPopulateSuccess: { type: 'function' },
        onPopulateError: { type: 'function' },
        onSyncSuccess: { type: 'function' },
        onSyncError: { type: 'function' }
      }
    })

    // Specific processing
    this.addStores(options.stores)
    this.addRouters(options.routers)

    // Handle routes
    self.addEventListener('fetch', (event) => {
      const request = event.request
      const route = this.#findRouteFromRequest(request)

      if (route) {
        // event.respondWith MUST be called synchronously with async processing inside
        // to prevent others handlers to trigger
        event.respondWith(
          this.#getRouteResponse(route, request)
        )
      }
    })
  }

  /*****************************************************************
  * Indexeddb management
  *****************************************************************/
  /**
   * Discover and apply database's migrations
   */
  async #configureDatabase () {
    const databaseMigrations = []
    const databaseSchemaNew = this.#databaseSchema

    // Parse the current database schema
    const databaseSchemaOld = {}
    const db = await openDB(this.databaseName)
    const databaseVersion = db.version

    if (db.objectStoreNames.length) { // https://developer.mozilla.org/fr/docs/Web/API/DOMStringList
      const transaction = db.transaction(db.objectStoreNames, 'readonly')
      for (const storeName of db.objectStoreNames) {
        const store = transaction.objectStore(storeName)
        const indexes = {}
        for (const indexName of store.indexNames) {
          indexes[indexName] = store.index(indexName).keyPath
        }
        databaseSchemaOld[storeName] = {
          keyPath: store.keyPath,
          indexes: indexes
        }
      }
    }
    db.close()

    // Delete stores, [Delete, Update, Create] indexes
    for (const storeNameOld in databaseSchemaOld) {
      if (storeNameOld in databaseSchemaNew) {
        const storeNew = databaseSchemaNew[storeNameOld]
        const storeOld = databaseSchemaOld[storeNameOld]

        // [Delete, Update] indexes
        for (const indexNameOld in storeOld.indexes) {
          // Update index
          if (indexNameOld in storeNew.indexes) {
            const indexKeyPathOld = storeOld.indexes[indexNameOld]
            const indexKeyPathNew = storeNew.indexes[indexNameOld]
            if (
              (isArray(indexKeyPathNew) && isArray(indexKeyPathOld) && indexKeyPathOld.some((item, position) => item !== indexKeyPathNew[position])) ||
              indexKeyPathOld !== indexKeyPathNew
            ) {
              databaseMigrations.push({
                type: 'deleteIndex',
                params: {
                  storeName: storeNameOld,
                  indexName: indexNameOld
                }
              }, {
                type: 'createIndex',
                params: {
                  storeName: storeNameOld,
                  indexName: indexNameOld,
                  indexKeyPath: indexKeyPathNew
                }
              })
            }
          // Delete index
          } else {
            databaseMigrations.push({
              type: 'deleteIndex',
              params: {
                storeName: storeNameOld,
                indexName: indexNameOld
              }
            })
          }
        }

        // Create indexes
        for (const indexNameNew in storeNew.indexes) {
          if (!(indexNameNew in storeOld.indexes)) {
            databaseMigrations.push({
              type: 'createIndex',
              params: {
                storeName: storeNameOld,
                indexName: indexNameNew,
                indexKeyPath: storeNew.indexes[indexNameNew]
              }
            })
          }
        }
      }
    }

    // Create stores
    for (const storeNameNew in databaseSchemaNew) {
      if (!(storeNameNew in databaseSchemaOld)) {
        const storeNew = databaseSchemaNew[storeNameNew]

        databaseMigrations.push({
          type: 'createStore',
          params: {
            storeName: storeNameNew,
            keyPath: storeNew.keyPath
          }
        })

        for (const indexNameNew in storeNew.indexes) {
          databaseMigrations.push({
            type: 'createIndex',
            params: {
              storeName: storeNameNew,
              indexName: indexNameNew,
              indexKeyPath: storeNew.indexes[indexNameNew]
            }
          })
        }
      }
    }

    // Apply migrations immediately
    if (databaseMigrations.length) {
      const dbUpgrade = await openDB(this.databaseName, databaseVersion + 1, {
        upgrade: (db, oldVersion, newVersion, transaction) => {
          for (const migration of databaseMigrations) {
            DB_OPERATIONS[migration.type](transaction, migration.params)
          }
        }
      })
      dbUpgrade.close()
    }
  }

  /**
   * Wait until the database is ready to handle requests
   */
  async #databaseReady () {
    // Configure database only on the very first call
    if (!this.#databaseConfigurationStarted) {
      this.#databaseConfigurationStarted = true
      await this.#configureDatabase()
      this.#databaseConfigurationEnded = true
    }

    return waitUntil(() => this.#databaseConfigurationEnded, {
      timeout: 10000,
      interval: 20,
      rejectMessage: '[Backinfront] An error occured during database migration',
    })
  }

  /**
  * Delete the database
  * @example Can be useful to clean a user profile on logout for example
  */
  async destroy () {
    await deleteDB(this.databaseName)
    this.#databaseConfigurationStarted = false
    this.#databaseConfigurationEnded = false
  }

  /**
   * Get a transaction
   * @param  {'readonly'|'readwrite'} mode
   * @param  {Array<string>} [storeNames=null]
   */
  async getTransaction (mode, storeNames = null) {
    await this.#databaseReady()
    const db = await openDB(this.databaseName)
    const transaction = db.transaction(storeNames || db.objectStoreNames, mode,  { durability: 'relaxed' })
    // The connection is not actually closed until all transactions
    // created using this connection are complete
    // https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/close
    db.close()
    return transaction
  }

  /**
   * Open a store
   * @param  {string} storeName
   * @param  {IDBTransaction|'readonly'|'readwrite'} mode
   */
  async openStore (storeName, mode) {
    const transaction = mode instanceof IDBTransaction
      ? mode
      : await this.getTransaction(mode, storeName)
    const store = transaction.objectStore(storeName)
    return store
  }

  /*****************************************************************
  * Sync management
  *****************************************************************/

  /**
   * Get a value from the key-value store owned by the lib
   * @param  {string} key
   */
  async #getMetadata (key) {
    const store = await this.openStore(this.#metadataStoreName, 'readonly')
    const value = await store.get(key)
    return value
  }

  /**
   * Set a value from the key-value store owned by the lib
   * @param {string} key
   * @param {any} value
   */
  async #setMetadata (key, value) {
    const store = await this.openStore(this.#metadataStoreName, 'readwrite')
    await store.put(value, key)
  }

  /**
   * Get all items from the queue store owned by the lib
   */
  async #getAllFromSyncQueue () {
    const rows = []
    const store = await this.openStore(this.#syncQueueStoreName, 'readonly')
    let cursor = await store.index('createdAt').openCursor(null, 'prev')
    while (cursor) {
      rows.push(cursor.value)
      cursor = await cursor.continue()
    }
    return rows
  }

  /**
   * Remove all itemms from the queue store owned by the lib
   */
  async #clearSyncQueue () {
    const store = await this.openStore(this.#syncQueueStoreName, 'readwrite')
    await store.clear()
  }

  /**
   * Add a new item to the queue store owned by the lib
   * @param {string} storeName
   * @param {string} primaryKey
   * @param {IDBTransaction} transaction
   */
  async addToSyncQueue (storeName, primaryKey, transaction) {
    const store = await this.openStore(this.#syncQueueStoreName, transaction)
    await store.add({
      id: generateUUID(),
      createdAt: (new Date()).toJSON(),
      modelName: storeName,
      primaryKey: primaryKey
    })
  }

  /*****************************************************************
  * Fetch management
  *****************************************************************/

  /**
  * Fetch helper to build the request url
  * @param {object} options
  * @param {string} options.pathname
  * @param {object} [options.searchParams]
  * @return {string}
  */
  #buildRequestUrl ({ pathname, searchParams }) {
    let requestUrl = pathname

    if (searchParams) {
      const stringifiedSearchParams = Object.entries(searchParams)
        .filter(([key, value]) => value !== undefined)
        .map(([key, value]) => {
          if (isDate(value)) {
            value = value.toJSON()
          }
          return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
        })
        .join('&')

      if (stringifiedSearchParams) {
        requestUrl += `?${stringifiedSearchParams}`
      }
    }

    return requestUrl
  }

  /**
  * Fetch helper to build the request init param
  * @param {object} body
  * @param {object} options
  * @param {object} options.method
  * @param {object} [options.bbody]
  */
  async #buildRequestInit ({ method, body }) {
    const requestInit = {
      method,
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json'
      }
    }

    // Set Authorization header
    if (authentication) {
      const token = await this.authentication()

      if (token) {
        requestInit.headers['Authorization'] = `Bearer ${token}`
      }
    }

    // Set body
    if (
      ['POST', 'PUT', 'PATCH'].includes(requestInit.method) &&
      body
    ) {
      requestInit.body = JSON.stringify(body)
    }

    return requestInit
  }

  /**
  * Fetch online data
  * @param {object} options
  * @param {string} options.method
  * @param {string} options.pathname
  * @param {object} [options.searchParams]
  * @param {object} [options.body]
  * @return {object}
  */
  async #fetch ({ method, pathname, searchParams, body }) {
    const requestUrl = this.#buildRequestUrl({ pathname, searchParams })
    const requestInit = await this.#buildRequestInit({ method, body })

    const fetchRequest = new Request(requestUrl, requestInit)
    let fetchResponse

    try {
      fetchResponse = await fetch(fetchRequest)

      if (!fetchResponse.ok) {
        throw new Error('[Backinfront][Fetch] Response status is not ok')
      }
    } catch (error) {
      throw new Error('[Backinfront][Fetch] Impossible to fetch data')
    }

    const serverData = await fetchResponse.json()

    return serverData
  }

  /*****************************************************************
  * Routing process on offline fetch
  *****************************************************************/

  /**
  * Find a route in the global list
  * @param {Request} request
  * @return {object}
  */
  #findRouteFromRequest (request) {
    const urlToTest = getUrlPath(new URL(request.url))

    return this.routes
      .filter(route => request.method === route.method)
      .find(route => route.regexp.test(urlToTest))
  }

  /**
  * Route handler inside service worker fetch
  * @param {object} route
  * @param {Request} request
  * @return {Response}
  */
  async #getRouteResponse (route, request) {
    const ctx = {
      request: request,
      state: {},
      searchParams: {},
      pathParams: {},
      body: null,
      transaction: null
    }

    const url = new URL(request.url)

    // Add search params to the context
    for (const [key, value] of url.searchParams) {
      ctx.searchParams[key] = this.formatRouteSearchParam(value)
    }

    // Find params
    // .match() return Array or null
    const matchs = getUrlPath(url).match(route.regexp)
    if (matchs) {
      // Remove the first match (the url itself)
      matchs.shift()
      // Map route params
      // Note: cannot use `in` operator because .match() return an array with custom properties
      for (const [idx, value] of matchs.entries()) {
        ctx.pathParams[route.pathParams[idx]] = this.formatRoutePathParam(value)
      }
    }

    // Merge state with user data
    ctx.state = { ...ctx.state, ...this.routeState(request) }

    if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
      // Provide the body
      ctx.body = await (request.clone()).json()
      // Provide a global transaction
      ctx.transaction = await this.getTransaction('readwrite')
    }

    // Try to execute the route action
    let result
    let errorCode = 'NOT_FOUND'

    try {
      result = await route.action(ctx, this.stores)

      // Progressive ehancement: commit not supported by safari on iOS (last check: 15/09/21)
      ctx.transaction?.commit?.()

      this.onRouteSuccess({ route, result })
    } catch (error) {
      errorCode = 'ACTION_ERROR'

      ctx.transaction?.abort()

      this.onRouteError({ route, error })
    }

    // Response
    if (result instanceof Response) {
      return result
    }
    if (result) {
      return new Response(JSON.stringify(result))
    }
    return new Response(undefined, this.ROUTE_ERRORS[errorCode])
  }

  /**
  * Add multiple stores in a single call
  * @param {Array<object>} storesParams
  */
  addStores (storesParams) {
    for (const storeParams of storesParams) {
      this.addStore(storeParams)
    }
  }

  /**
  * Add a store
  * @param {object} storeParams
  * @return {object}
  */
  addStore (storeParams) {
    const store = new Store(this, storeParams)
    this.stores[store.storeName] = store
    this.#databaseSchema[store.storeName] = {}
    if (store.primaryKey) {
      this.#databaseSchema[store.storeName].keyPath = store.primaryKey
    }
    if (store.indexes) {
      this.#databaseSchema[store.storeName].indexes = store.indexes
    }

    return store
  }

  /**
  * Add multiple routers in a single call
  * @param {Array<object>} routersParams
  */
  addRouters (routersParams) {
    for (const routerParams of routersParams) {
      this.addRouter(routerParams)
    }
  }

  /**
  * Add a router
  * @param {object} routerParams
  * @return {object}
  */
  addRouter (routerParams) {
    const router = new Router(routerParams)
    // Add router's routes to the global list
    this.routes.push(...router.routes)
    // Routes must be reordered by specificity
    this.routes.sort((a, b) => b.specificity - a.specificity)

    return router
  }

  /**
  * Add a custom where operator
  * @param {string} operatorName - where clause
  * @param {function} operatorAction - item to compare the condition with
  */
  addQueryOperator (operatorName, operatorAction) {
    QueryLanguage.addOperator(operatorName, operatorAction)
  }


  /*****************************************************************
  * Sync management
  *****************************************************************/

  /**
  * Fill the database with initial data
  * @param {Array<string>} storesToInclude
  */
  async populate (storesToInclude = []) {
    // Process filter options
    const storeNames = Object.entries(this.stores)
      .filter(([storeName, store]) => storesToInclude.includes(storeName))
      .map(([storeName, store]) => storeName)

    try {
      const serverDataToSync = await this.#fetch({
        method: 'GET',
        pathname: this.populateUrl,
        searchParams: {
          modelNames: storeNames
        }
      })

      await Promise.all(
        Object.keys(serverDataToSync)
          .map(async (storeName) => {
            // Here we use one transaction per store instead of a global one
            // because high number of inserts on the same transaction can be slow
            const store = await this.openStore(storeName, 'readwrite')
            const rows = serverDataToSync[storeName]

            return Promise.all(
              rows.map(item => store.put(item))
            )
          })
      )

      this.onPopulateSuccess()
    } catch (error) {
      this.onPopulateError({ error })
    }
  }

  /**
  * Sync the database
  */
  async sync () {
    if (this.#syncInProgress) {
      return null
    }

    try {
      this.#syncInProgress = true

      // Init lastChangeAt
      let currentLastChangeAt = await this.#getMetadata('lastChangeAt')
      let nextLastChangeAt = null

      if (!currentLastChangeAt) {
        currentLastChangeAt = new Date()
        nextLastChangeAt = currentLastChangeAt
      }

      // Retrieve data to sync
      const syncQueueItems = await this.#getAllFromSyncQueue()
      const clientDataToSync = await Promise.all(
        deduplicateArray(syncQueueItems, ['primaryKey','modelName'])
          .map(async ({ createdAt, modelName, primaryKey }) => ({
            createdAt,
            modelName,
            primaryKey,
            data: await this.stores[modelName].findOne(primaryKey)
          }))
      )

      // Send data to sync
      const serverDataToSync = await this.#fetch({
        method: 'POST',
        pathname: this.syncUrl,
        searchParams: {
          lastChangeAt: currentLastChangeAt
        },
        body: clientDataToSync
      })

      // Sync data from server
      const transaction = await this.getTransaction('readwrite')

      for (const { createdAt, modelName, data } of serverDataToSync) {
        const store = await this.openStore(modelName, transaction)
        await store.put(data)

        if (!nextLastChangeAt || isAfterDate(parseDate(createdAt), nextLastChangeAt)) {
          nextLastChangeAt = parseDate(createdAt)
        }
      }

      // Save the last sync date
      if (nextLastChangeAt) {
        await this.#setMetadata('lastChangeAt', nextLastChangeAt.toJSON())
      }

      // Clear the queue if not empty
      if (syncQueueItems.length) {
        await this.#clearSyncQueue()
      }

      this.onSyncSuccess()
    } catch (error) {
      this.onSyncError({ error })
    } finally {
      this.#syncInProgress = false
    }
  }
}
