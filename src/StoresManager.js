import { openDB, deleteDB } from 'https://unpkg.com/idb@6.0.0/build/esm/index.js'

import QueryLanguage from './QueryLanguage.js'
import Store from './Store.js'

import isDate from './utils/isDate.js'
import isArray from './utils/isArray.js'
import parseDate from './utils/parseDate.js'
import isAfterDate from './utils/isAfterDate.js'
import getUrlPath from './utils/getUrlPath.js'
import joinPaths from './utils/joinPaths.js'
import generateUUID from './utils/generateUUID.js'
import urlToRegexp from './utils/urlToRegexp.js'


export default class StoresManager {
  #LOCAL_FETCH_ERRORS = {
    'NOT_FOUND': {
      status: 404,
      statusText: 'Not found'
    },
    'ACTION_ERROR': {
      status: 500,
      statusText: 'Action error'
    }
  }

  #DB_OPERATIONS = {
    'addStore': (transaction, { storeName, primaryKey }) => {
      if (primaryKey) {
        transaction.db.createObjectStore(storeName, { keyPath: primaryKey })
      } else {
        transaction.db.createObjectStore(storeName)
      }
    },
    'deleteStore': (transaction, { storeName }) => {
      transaction.db.deleteObjectStore(storeName)
    },
    'addIndex': (transaction, { storeName, indexName, indexKey }) => {
      transaction.objectStore(storeName).createIndex(indexName, indexKey)
    },
    'deleteIndex': (transaction, { storeName, indexName }) => {
      transaction.objectStore(storeName).deleteIndex(indexName)
    }
  }

  #syncInProgress = false


  /*****************************************************************
  * Helpers
  *****************************************************************/

  /**
  * Filter a list of models
  * @param {object} option - include/exclude some models
  */
  #globalFilter (options = {}) {
    const include = options.include || []
    const exclude = options.exclude || []

    return Object.entries(this.stores)
      // Filter models
      .filter(([storeName, store]) => {
        if (exclude.includes(storeName)) {
          return false
        }
        if (include.length === 0) {
          return true
        }
        return include.includes(storeName)
      })
  }

  /*****************************************************************
  * Indexeddb management
  *****************************************************************/

  /**
  * Connect to the indexeddb database and
  * proceed to pending migration
  */
  async #connectDatabase () {
    const db = await openDB(this.databaseName, this.databaseMigrations.length, {
      upgrade: (db, oldVersion, newVersion, transaction) => {
        for (const [idx, migration] of this.databaseMigrations.entries()) {
          const version = idx + 1

          if (oldVersion < version) {
            for (const operation of migration) {
              const operationType = operation[0]
              const operationOptions = operation[1]
              this.#DB_OPERATIONS[operationType](transaction, operationOptions)
            }
          }
        }
      }
    })
    return db
  }

  /**
  * Get a transaction
  */
  async getTransaction (mode, storeNames = null) {
    const db = await this.#connectDatabase()
    const transaction = db.transaction(storeNames || db.objectStoreNames, mode)
    // The connection is not actually closed until all transactions
    // created using this connection are complete
    // https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/close
    db.close()
    return transaction
  }

  /**
  * Open the store
  */
  async openStore (storeName, mode, transaction = null) {
    transaction = transaction || await this.getTransaction(mode, storeName)
    const store = transaction.objectStore(storeName)
    return store
  }


  /**
  * Use a cursor to iterate on a store or index
  * @param {array} order - [index name, direction]
  * @param {function} filter - filter the cursor value
  */
  async iterate (store, order, filter) {
    const rows = []

    // Initialize cursor params
    let index = store
    let direction = 'next'

    if (order) {
      index = store.index(order[0])

      if (order[1] === 'DESC') {
        direction = 'prev'
      }
    }

    if (!filter) {
      filter = () => true
    }

    // Cursor iteration
    let cursor = await index.openCursor(null, direction)

    while (cursor) {
      if (filter(cursor.value)) {
        rows.push(cursor.value)
      }

      cursor = await cursor.continue()
    }

    return rows
  }

  /**
  * Add a custom where operator
  * @param {string} operatorName - where clause
  * @param {function} operatorAction - item to compare the condition with
  * @return {void}
  */
  addQueryOperator (operatorName, operatorAction) {
    QueryLanguage.addOperator(operatorName, operatorAction)
  }

  /*****************************************************************
  * Sync management
  *****************************************************************/

  async #getMeta (key) {
    const transaction = await this.getTransaction('readonly', this.syncMetaStoreName)
    const value = await transaction.objectStore(this.syncMetaStoreName).get(key)
    return value
  }

  async #setMeta (key, value) {
    const transaction = await this.getTransaction('readwrite', this.syncMetaStoreName)
    await transaction.objectStore(this.syncMetaStoreName).put(value, key)
  }

  async #getFromSyncQueue () {
    const transaction = await this.getTransaction('readwrite', this.syncQueueStoreName)
    const store = transaction.objectStore(this.syncQueueStoreName)
    const syncQueueItems = await this.iterate(store, ['createdAt', 'ASC'])
    return syncQueueItems
  }

  async #clearSyncQueue () {
    const transaction = await this.getTransaction('readwrite', this.syncQueueStoreName)
    await transaction.objectStore(this.syncQueueStoreName).clear()
  }

  async addToSyncQueue (storeName, primaryKey, transaction) {
    const store = transaction.objectStore(this.syncQueueStoreName)
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
  * @param {object} { pathname, searchParams }
  */
  #buildRequestUrl ({ pathname, searchParams }) {
    let requestUrl = joinPaths(this.baseUrl, pathname)

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
  * @param {object} data
  * @param {object} options
  */
  async #buildRequestInit (data = null, options = {}) {
    const requestInit = {
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json'
      },
      ...options
    }

    // Set Authorization header for private api
    const token = await this.authToken()

    if (token) {
      requestInit.headers['Authorization'] = `Bearer ${token}`
    }

    // Set body
    if (
      ['POST', 'PUT', 'PATCH'].includes(requestInit.method) &&
      data
    ) {
      requestInit.body = JSON.stringify(data)
    }

    return requestInit
  }

  /**
  * Fetch online data
  * @param {object} options
  */
  async #fetch (options = {}) {
    const requestUrl = this.#buildRequestUrl(options)
    const requestInit = await this.#buildRequestInit(options.data, { method: options.method })

    const fetchRequest = new Request(requestUrl, requestInit)
    let fetchResponse

    try {
      fetchResponse = await fetch(fetchRequest)

      if (!fetchResponse.ok) {
        throw new Error('[BackInFront][Fetch] Response status is not ok')
      }
    } catch (error) {
      throw new Error('[BackInFront][Fetch] Impossible to fetch data')
    }

    const serverData = await fetchResponse.json()

    return serverData
  }

  /*****************************************************************
  * Routing process on offline fetch
  *****************************************************************/

  /**
  * Find a route in the global list
  * @param {object} request
  */
  #findRouteFromRequest (request) {
    const requestUrl = new URL(request.url)

    if (requestUrl.origin !== this.baseUrl) {
      return undefined
    }

    return this.routes
      .filter(route => request.method === route.method)
      .find(route => route.regexp.test(getUrlPath(requestUrl)))
  }

  /**
  * Route handler inside service worker fetch
  * @param {object} route
  * @param {object} request
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
    let errorCode

    try {
      result = await route.action(ctx, this.stores)

      // Progressive ehancement: commit not supported by safari (last check: 10/04/21)
      if (ctx.transaction && 'commit' in ctx.transaction) {
        ctx.transaction.commit()
      }
    } catch (error) {
      errorCode = 'ACTION_ERROR'

      this.onRouteActionError({ route, error })

      if (ctx.transaction) {
        ctx.transaction.abort()
      }
    }

    this.onRouteActionSuccess({ route, result })

    // Response
    if (result instanceof Response) {
      return result
    }
    if (result) {
      return new Response(JSON.stringify(result))
    }
    return new Response(undefined, this.#LOCAL_FETCH_ERRORS[errorCode || 'NOT_FOUND'])
  }

  /*****************************************************************
  * Instance methods
  *****************************************************************/

  /**
  * Configuration
  * @param {object} options
  */
  constructor (options = {}) {
    if (!options.databaseName) {
      throw new Error('[BackInFront] `databaseName` is required')
    }
    if (!options.databaseMigrations || !isArray(options.databaseMigrations)) {
      throw new Error('[BackInFront] `databaseMigrations` is required and must be an array')
    }
    if (!options.baseUrl) {
      throw new Error('[BackInFront] `baseUrl` is required')
    }
    if (!options.syncEndpoint) {
      throw new Error('[BackInFront] `syncEndpoint` is required')
    }
    if (!options.populateEndpoint) {
      throw new Error('[BackInFront] `populateEndpoint` is required')
    }

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

    // Global config
    this.routes = []
    this.stores = {}
    this.syncMetaStoreName = '_SyncMeta'
    this.syncQueueStoreName = '_SyncQueue'
    this.databaseMigrations = [
      [
        ['addStore', {
          storeName: this.syncMetaStoreName
        }],
        ['addStore', {
          storeName: this.syncQueueStoreName,
          primaryKey: 'id'
        }],
        ['addIndex', {
          storeName: this.syncQueueStoreName,
          indexName: 'createdAt',
          indexKey: 'createdAt'
        }]
      ]
    ]

    // User config
    this.databaseName = options.databaseName
    this.databaseMigrations = this.databaseMigrations.concat(options.databaseMigrations)
    this.baseUrl = options.baseUrl
    this.syncEndpoint = options.syncEndpoint
    this.populateEndpoint = options.populateEndpoint
    this.authToken = options.authToken
      ? options.authToken
      : () => null
    this.routeState = options.routeState
      ? options.routeState
      : () => null
    this.formatRouteSearchParam = options.formatRouteSearchParam
      ? options.formatRouteSearchParam
      : (value) => value
    this.formatRoutePathParam = options.formatRoutePathParam
      ? options.formatRoutePathParam
      : (value) => value
    this.onRouteActionError = options.onRouteActionError
      ? options.onRouteActionError
      : () => null
    this.onRouteActionSuccess = options.onRouteActionSuccess
      ? options.onRouteActionSuccess
      : () => null
    this.onPopulateSuccess = options.onPopulateSuccess
      ? options.onPopulateSuccess
      : () => null
    this.onPopulateError = options.onPopulateError
      ? options.onPopulateError
      : () => null
    this.onSyncSuccess = options.onSyncSuccess
      ? options.onSyncSuccess
      : () => null
    this.onSyncError = options.onSyncError
      ? options.onSyncError
      : () => null

    // Stores processing
    if (options.stores) {
      this.addStores(options.stores)
    }
  }

  /**
  * Add multiple store interfaces in a single call
  * @param {object} storeParams
  */
  addStores (storesParams) {
    const stores = []
    for (const storeParams of storesParams) {
      stores.push(this.addStore(storeParams))
    }

    return stores
  }

  /**
  * Add a store interface with its routes
  * @param {object} storeParams
  */
  addStore (storeParams) {
    const store = new Store(this, storeParams)
    this.stores[store.storeName] = store

    // Routes
    for (const route of store.routes) {
      const urlString = joinPaths(this.baseUrl, store.endpoint, route.pathname)
      const routeRegexp = urlToRegexp(urlString)

      this.routes.push({
        specificity: (route.pathname.split('/').length * 2) - routeRegexp.pathParams.length,
        ...routeRegexp,
        ...route
      })
    }

    // Routes must be ordered by specificity
    this.routes.sort((a, b) => b.specificity - a.specificity)

    return store
  }


  /*****************************************************************
  * Sync management
  *****************************************************************/

  /**
  * Delete the database
  * Can be useful to clean a user profile on logout for example
  */
  async deleteDatabase () {
    await deleteDB(this.databaseName)
  }

  /**
  * Fill the database with initial data
  * @param {object} filterOptions
  */
  async populate (filterOptions) {
    try {
      const serverDataToSync = await this.#fetch({
        method: 'GET',
        pathname: this.populateEndpoint,
        searchParams: {
          modelNames: this.#globalFilter(filterOptions).map(([storeName, store]) => storeName)
        }
      })

      const transaction = await this.getTransaction('readwrite')

      await Promise.all(
        Object
          .keys(serverDataToSync)
          .map(async (modelName) => {
            const store = await this.openStore(modelName, 'readwrite', transaction)
            const rows = serverDataToSync[modelName]

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

    this.#syncInProgress = true

    try {
      const syncQueueItems = await this.#getFromSyncQueue()

      // Deduplicates result
      const syncQueueItemsDeduplicated = []
      for (const { createdAt, modelName, primaryKey } of syncQueueItems) {
        if (!syncQueueItemsDeduplicated.some(item => item.primaryKey === primaryKey && item.modelName === modelName)) {
          syncQueueItemsDeduplicated.push({
            modelName,
            primaryKey,
            toData: async () => ({
              createdAt,
              modelName,
              primaryKey,
              data: await this.stores[modelName].findOne(primaryKey)
            })
          })
        }
      }

      // Proceed to parallel db request
      const clientDataToSync = await Promise.all(
        syncQueueItemsDeduplicated.map(item => item.toData())
      )

      // Init lastChangeAt
      let lastChangeAt = await this.#getMeta('lastChangeAt')
      let lastChangeAtToSave = null

      if (!lastChangeAt) {
        lastChangeAt = new Date()
        lastChangeAtToSave = lastChangeAt
      }

      // Send data to sync
      const serverDataToSync = await this.#fetch({
        method: 'POST',
        pathname: this.syncEndpoint,
        searchParams: {
          lastChangeAt: lastChangeAt
        },
        data: clientDataToSync
      })

      // Sync data from server
      const transaction = await this.getTransaction('readwrite')

      for (const { createdAt, modelName, data } of serverDataToSync) {
        const store = await this.openStore(modelName, 'readwrite', transaction)
        await store.put(data)

        if (!lastChangeAtToSave || isAfterDate(parseDate(createdAt), lastChangeAtToSave)) {
          lastChangeAtToSave = parseDate(createdAt)
        }
      }

      // Save the last sync date
      if (lastChangeAtToSave) {
        await this.#setMeta('lastChangeAt', lastChangeAtToSave.toJSON())
      }

      // Clear the queue if not empty
      if (syncQueueItems.length) {
        await this.#clearSyncQueue()
      }

      this.onSyncSuccess()
    } catch (error) {
      this.onSyncError({ error })
    }

    this.#syncInProgress = false
  }
}
