import { openDB, deleteDB } from 'idb'

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
import objectToJson from './utils/objectToJson.js'
import waitUntil from './utils/waitUntil.js'


export default class Backinfront {
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
    'createStore': (transaction, { storeName, keyPath }) => {
      if (keyPath) {
        transaction.db.createObjectStore(storeName, { keyPath: keyPath })
      } else {
        transaction.db.createObjectStore(storeName)
      }
    },
    'deleteStore': (transaction, { storeName }) => {
      transaction.db.deleteObjectStore(storeName)
    },
    'createIndex': (transaction, { storeName, indexName, indexKeyPath }) => {
      transaction.objectStore(storeName).createIndex(indexName, indexKeyPath)
    },
    'deleteIndex': (transaction, { storeName, indexName }) => {
      transaction.objectStore(storeName).deleteIndex(indexName)
    }
  }

  #syncInProgress = false
  routes = []
  stores = {}
  syncMetaStoreName = '__Meta'
  syncQueueStoreName = '__SyncQueue'
  databaseVersion = null
  databaseConfigurationStarted = false
  databaseConfigurationEnded = false
  databaseMigrations = []
  databaseSchemaSpec = {
    [this.syncMetaStoreName]: {
      keyPath: null
    },
    [this.syncQueueStoreName]: {
      keyPath: 'id',
      indexes: {
        'createdAt': 'createdAt'
      }
    }
  }
  authToken = () => null
  routeState = () => null
  formatRouteSearchParam = (value) => value
  formatRoutePathParam = (value) => value
  onRouteActionError = () => null
  onRouteActionSuccess = () => null
  onPopulateSuccess = () => null
  onPopulateError = () => null
  onSyncSuccess = () => null
  onSyncError = () => null
  formatDataBeforeSave = (data) => objectToJson(data)

  /**
  * Configuration
  * @param {object} options
  */
  constructor (options = {}) {
    if (options.databaseName) {
      this.databaseName = options.databaseName
    } else {
      throw new Error('[BackInFront] `databaseName` is required')
    }
    if (options.baseUrl) {
      this.baseUrl = options.baseUrl
    } else {
      throw new Error('[BackInFront] `baseUrl` is required')
    }
    if (options.syncEndpoint) {
      this.syncEndpoint = options.syncEndpoint
    } else {
      throw new Error('[BackInFront] `syncEndpoint` is required')
    }
    if (options.populateEndpoint) {
      this.populateEndpoint = options.populateEndpoint
    } else {
      throw new Error('[BackInFront] `populateEndpoint` is required')
    }
    if (options.formatBeforeSave) {
      this.formatBeforeSave = options.formatBeforeSave
    }
    if (options.authToken) {
      this.authToken = options.authToken
    }
    if (options.routeState) {
      this.routeState = options.routeState
    }
    if (options.formatRouteSearchParam) {
      this.formatRouteSearchParam = options.formatRouteSearchParam
    }
    if (options.formatRoutePathParam) {
      this.formatRoutePathParam = options.formatRoutePathParam
    }
    if (options.onRouteActionError) {
      this.onRouteActionError = options.onRouteActionError
    }
    if (options.onRouteActionSuccess) {
      this.onRouteActionSuccess = options.onRouteActionSuccess
    }
    if (options.onPopulateSuccess) {
      this.onPopulateSuccess = options.onPopulateSuccess
    }
    if (options.onSyncSuccess) {
      this.onSyncSuccess = options.onSyncSuccess
    }
    if (options.onSyncError) {
      this.onSyncError = options.onSyncError
    }

    // Stores processing
    if (options.stores) {
      this.addStores(options.stores)
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
  }

  /*****************************************************************
  * Indexeddb management
  *****************************************************************/

  async migrationsReady () {
    if (!this.databaseConfigurationStarted) {
      console.log('doit apparaitre une fois')
      this.databaseConfigurationStarted = true

      this.databaseMigrations = []
      const db = await openDB(this.databaseName)

      // Remove old stuff
      for (const storeName of db.objectStoreNames) {
        // Delete or update indexes
        if (storeName in this.databaseSchemaSpec) {
          const storeSpec = this.databaseSchemaSpec[storeName]
          const store = db.transaction(storeName, 'readonly').objectStore(storeName)

          // Update or delete indexes
          for (const indexName of store.indexNames) {
            // Update index
            if (indexName in storeSpec.indexes) {
              const indexKeyPath = storeSpec.indexes[indexName]
              if (indexKeyPath !== store.index(indexName).keyPath) {
                this.databaseMigrations.push(['deleteIndex', {
                  indexName
                }])
                this.databaseMigrations.push(['createIndex', {
                  storeName,
                  indexName,
                  indexKeyPath
                }])
              }
            // Delete index
            } else {
              this.databaseMigrations.push(['deleteIndex', {
                indexName
              }])
            }
          }

          // Create indexes
          for (const indexName in storeSpec.indexes) {
            // indexNames type is DOMStringList https://developer.mozilla.org/fr/docs/Web/API/DOMStringList
            if (!store.indexNames.contains(indexName)) {
              const indexKeyPath = storeSpec.indexes[indexName]
              this.databaseMigrations.push(['createIndex', {
                storeName,
                indexName,
                indexKeyPath
              }])
            }
          }
        // Delete store (and indexes implicitly)
        } else {
          this.databaseMigrations.push(['deleteStore', {
            storeName
          }])
        }
      }

      // Create stores
      for (const storeName in this.databaseSchemaSpec) {
        // objectStoreNames type is DOMStringList https://developer.mozilla.org/fr/docs/Web/API/DOMStringList
        if (!db.objectStoreNames.contains(storeName)) {
          const storeSpec = this.databaseSchemaSpec[storeName]
          this.databaseMigrations.push(['createStore', {
            storeName,
            keyPath: storeSpec.keyPath
          }])

          for (const indexName in storeSpec.indexes) {
            const indexKeyPath = storeSpec.indexes[indexName]
            this.databaseMigrations.push(['createIndex', {
              storeName,
              indexName,
              indexKeyPath
            }])
          }
        }
      }

      this.databaseVersion = this.databaseMigrations.length
        ? db.version + 1
        : db.version

      db.close()

      this.databaseConfigurationEnded = true
    }

    return waitUntil(() => this.databaseConfigurationEnded, 'Error during migration')
  }

  /**
  * Open the indexeddb database and
  * proceed to pending migration
  */
  async #openDatabase () {
    await this.migrationsReady()

    const db = await openDB(this.databaseName, this.databaseVersion, {
      upgrade: (db, oldVersion, newVersion, transaction) => {
        if (oldVersion < newVersion) {
          for (const migration of this.databaseMigrations) {
            const migrationType = migration[0]
            const migrationOptions = migration[1]
            this.#DB_OPERATIONS[migrationType](transaction, migrationOptions)
          }
        }
      }
    })

    return db
  }

  /**
  * Delete the database
  * Can be useful to clean a user profile on logout for example
  */
  async deleteDatabase () {
    await deleteDB(this.databaseName)
  }

  /**
  * Get a transaction
  */
  async getTransaction (mode, storeNames = null) {
    const db = await this.#openDatabase()
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

  /*****************************************************************
  * Sync management
  *****************************************************************/

  async #getMeta (key) {
    const store = await this.openStore(this.syncMetaStoreName, 'readonly')
    const value = await store.get(key)
    return value
  }

  async #setMeta (key, value) {
    const store = await this.openStore(this.syncMetaStoreName, 'readwrite')
    await store.put(value, key)
  }

  async #getFromSyncQueue () {
    const rows = []
    const store = await this.openStore(this.syncQueueStoreName, 'readonly')
    let cursor = await store.index('createdAt').openCursor(null, 'prev')
    while (cursor) {
      rows.push(cursor.value)
      cursor = await cursor.continue()
    }
    return rows
  }

  async #clearSyncQueue () {
    const store = await this.openStore(this.syncQueueStoreName, 'readwrite')
    await store.clear()
  }

  async addToSyncQueue (storeName, primaryKey, transaction) {
    const store = await this.openStore(this.syncQueueStoreName, transaction)
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
    if (!request.url.startsWith(this.baseUrl)) {
      return undefined
    }

    return this.routes
      .filter(route => request.method === route.method)
      .find(route => route.regexp.test(getUrlPath(new URL(request.url))))
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

      this.onRouteActionSuccess({ route, result })
    } catch (error) {
      errorCode = 'ACTION_ERROR'

      this.onRouteActionError({ route, error })

      if (ctx.transaction) {
        ctx.transaction.abort()
      }
    }

    // Response
    if (result instanceof Response) {
      return result
    }
    if (result) {
      return new Response(JSON.stringify(result))
    }
    return new Response(undefined, this.#LOCAL_FETCH_ERRORS[errorCode || 'NOT_FOUND'])
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
    this.databaseSchemaSpec[store.storeName] = {
      keyPath: store.primaryKey,
      indexes: store.indexes
    }

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

  /**
  * Fill the database with initial data
  * @param {object} filterOptions
  */
  async populate (filterOptions) {
    // Process filter options
    const storesToInclude = filterOptions.include || []
    const storesToExclude = filterOptions.exclude || []
    const storeNames = Object.entries(this.stores)
      .filter(([storeName, value]) => {
        if (storesToExclude.includes(storeName)) {
          return false
        }
        if (storesToInclude.length === 0) {
          return true
        }
        return storesToInclude.includes(storeName)
      })
      .map(([storeName, store]) => storeName)

    try {
      const serverDataToSync = await this.#fetch({
        method: 'GET',
        pathname: this.populateEndpoint,
        searchParams: {
          modelNames: storeNames
        }
      })

      const transaction = await this.getTransaction('readwrite')

      await Promise.all(
        Object
          .keys(serverDataToSync)
          .map(async (storeName) => {
            const store = await this.openStore(storeName, 'readwrite', transaction)
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

    this.#syncInProgress = true

    try {
      const syncQueueItems = await this.#getFromSyncQueue()

      // Deduplicates result
      const syncQueueItemsDeduplicated = syncQueueItems.filter((value, index, array) => index === array.findIndex(item => (item.place === value.place && item.name === value.name)))

      // Retrieve data to sync
      const clientDataToSync = await Promise.all(
        syncQueueItemsDeduplicated.map(async ({ createdAt, modelName, primaryKey }) => ({
          createdAt,
          modelName,
          primaryKey,
          data: await this.stores[modelName].findOne(primaryKey)
        }))
      )

      // Init lastChangeAt
      let currentLastChangeAt = await this.#getMeta('lastChangeAt')
      let nextLastChangeAt = null

      if (!currentLastChangeAt) {
        currentLastChangeAt = new Date()
        nextLastChangeAt = currentLastChangeAt
      }

      // Send data to sync
      const serverDataToSync = await this.#fetch({
        method: 'POST',
        pathname: this.syncEndpoint,
        searchParams: {
          lastChangeAt: currentLastChangeAt
        },
        data: clientDataToSync
      })

      // Sync data from server
      const transaction = await this.getTransaction('readwrite')

      for (const { createdAt, modelName, data } of serverDataToSync) {
        const store = await this.openStore(modelName, 'readwrite', transaction)
        await store.put(data)

        if (!nextLastChangeAt || isAfterDate(parseDate(createdAt), nextLastChangeAt)) {
          nextLastChangeAt = parseDate(createdAt)
        }
      }

      // Save the last sync date
      if (nextLastChangeAt) {
        await this.#setMeta('lastChangeAt', nextLastChangeAt.toJSON())
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
