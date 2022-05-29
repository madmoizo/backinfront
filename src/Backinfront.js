import { openDB, deleteDB } from 'idb'
import {
  has,
  isAfterDate,
  isArray,
  mergeObject,
  parseDate,
  stringifySearchParams,
  typecheck,
  waitUntil
} from 'utililib'
import BackinfrontError from './BackinfrontError.js'
import QueryLanguage from './QueryLanguage.js'
import Router from './Router.js'
import Store from './Store.js'


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
  routes = {}
  stores = {}
  authentication = false
  collectionCountKey = 'count'
  collectionDataKey = 'rows'
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
  * @constructor
  * @param {object} options
  * @param {string} options.databaseName
  * @param {Array<object>} options.stores - list of store's configurations
  * @param {Array<object>} options.router - list of store's configurations
  * @param {string} options.populateUrl - part of url corresponding to the populate endpoint
  * @param {string} options.syncUrl - part of url corresponding to the sync endpoint
  * @param {function|false} [options.authentication] - must return a JWT to authenticate populate & sync requests
  * @param {function} [options.collectionCountKey]
  * @param {function} [options.collectionDataKey]
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
    typecheck({
      options: {
        value: options,
        type: ['object', {
          databaseName: { type: 'string', required: true },
          stores: { type: 'array', required: true },
          routers: { type: 'array', required: true },
          syncUrl: { type: 'string', required: true },
          populateUrl: { type: 'string', required: true },
          authentication: { type: ['function', 'false'] },
          collectionCountKey: { type: 'string' },
          collectionDataKey: { type: 'string' },
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
        }]
      }
    })

    mergeObject({
      source: options,
      target: this,
      exceptions: {
        routers: (value) => this.addRouters(value),
        stores: (value) => this.addStores(value)
      }
    })

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
      interval: 20
    })
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

  /**
  * Delete the database
  * @example Can be useful to clean a user profile on logout for example
  */
  async destroy () {
    await deleteDB(this.databaseName)
    this.#databaseConfigurationStarted = false
    this.#databaseConfigurationEnded = false
  }

  /*****************************************************************
  * Sync management
  *****************************************************************/

  /**
   * Add a new item to the queue store owned by the lib
   * @param {string} storeName
   * @param {string} primaryKey
   * @param {IDBTransaction} transaction
   */
  async addToSyncQueue ({ storeName, primaryKey, data }, transaction) {
    const store = await this.openStore(this.#syncQueueStoreName, transaction)
    await store.add({
      id: crypto.randomUUID(),
      createdAt: new Date().toJSON(),
      storeName,
      primaryKey,
      data
    })
  }

  /*****************************************************************
  * Fetch management
  *****************************************************************/

  /**
  * Fetch helper to build the request init param
  * @param {object} body
  * @param {object} options
  * @param {object} options.method
  * @param {object} [options.body]
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
    if (this.authentication) {
      const token = await this.authentication()

      if (token) {
        requestInit.headers['Authorization'] = `Bearer ${token}`
      }
    }

    // Set body
    if (body && ['POST', 'PUT', 'PATCH'].includes(requestInit.method)) {
      requestInit.body = JSON.stringify(body)
    }

    return requestInit
  }

  /**
  * Fetch online data
  * @param {object} options
  * @param {string} options.method
  * @param {string} options.url
  * @param {object} [options.searchParams]
  * @param {object} [options.body]
  * @return {object}
  */
  async #fetch ({ method, url, searchParams, body }) {
    const requestUrl = `${url}${stringifySearchParams(searchParams)}`
    const requestInit = await this.#buildRequestInit({ method, body })
    const fetchRequest = new Request(requestUrl, requestInit)
    let fetchResponse

    try {
      fetchResponse = await fetch(fetchRequest)

      if (!fetchResponse.ok) {
        throw new Error('Response status is not ok')
      }
    } catch (error) {
      throw new BackinfrontError(`fetch: ${error.message}`)
    }

    return fetchResponse.json()
  }

  /*****************************************************************
  * Routing process on offline fetch
  *****************************************************************/

  /**
  * Find a route in the global list
  * @param {Request} request
  * @return {object | undefined}
  */
  #findRouteFromRequest (request) {
    const url = new URL(request.url)
    const routeLocation = this.routes[url.origin]?.[request.method]?.[url.pathname.match(/[^/]+/g).length]
    return routeLocation?.find(route => route.regexp.test(`${url.origin}${url.pathname}`))
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
    const matchs = `${url.origin}${url.pathname}`.match(route.regexp)
    if (matchs) {
      // Remove the first match (the url itself)
      matchs.shift()
      // Map route params
      for (const [idx, value] of matchs.entries()) {
        ctx.pathParams[route.pathParams[idx]] = this.formatRoutePathParam(value)
      }
    }

    // Merge state with user data
    ctx.state = { ...ctx.state, ...this.routeState(request) }

    if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
      ctx.body = await (request.clone()).json()
    }

    // Provide a global transaction
    ctx.transaction = await this.getTransaction('readwrite')

    // Try to execute the route action
    let routeHandlerResult
    let routeHandlerError

    try {
      routeHandlerResult = await route.handler(ctx, this.stores)

      ctx.transaction?.commit?.()
    } catch (error) {
      routeHandlerError = error
      ctx.transaction?.abort()
    }

    if (routeHandlerError) {
      this.onRouteError({ route, error: routeHandlerError })
      return new Response(undefined, {
        status: 500,
        statustext: `Route handler error: ${routeHandlerError.message}`
      })
    }

    this.onRouteSuccess({ route, result: routeHandlerResult })
    return routeHandlerResult instanceof Response
      ? routeHandlerResult
      : new Response(JSON.stringify(routeHandlerResult)) 
  }

  /*****************************************************************
  * Process stores & routers
  *****************************************************************/

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
    // Add the store to the hashtable
    this.stores[store.storeName] = store
    // Add the store to the database schema
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

    // Add the origin if new
    if (!has(this.routes, router.origin)) {
      this.routes[router.origin] = {}
    }
    // Add routes to the origin list
    for (const route of router.routes) {
      if (!has(this.routes[router.origin], route.method)) {
        this.routes[router.origin][route.method] = {}
      }
      if (!has(this.routes[router.origin][route.method], route.length)) {
        this.routes[router.origin][route.method][route.length] = []
      }
      // Add the route and reorder
      this.routes[router.origin][route.method][route.length].push(route)
      this.routes[router.origin][route.method][route.length].sort((a, b) => b.specificity - a.specificity)
    }

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
      const response = await this.#fetch({
        method: 'GET',
        url: this.populateUrl,
        searchParams: {
          storeNames
        }
      })

      await Promise.all(
        Object.entries(response).map(async ([storeName, rows]) => {
          // Here we use one transaction per store instead of a global one
          // because high number of inserts on the same transaction can be slow
          const store = await this.openStore(storeName, 'readwrite')

          return Promise.all(
            rows.map(element => store.put(element))
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

      const transaction = await this.getTransaction('readwrite')
      const [metadataStore, syncQueueStore] = Promise.all([
        this.openStore(this.#metadataStoreName, transaction),
        this.openStore(this.#syncQueueStoreName, transaction)
      ])

      // Init lastChangeAt
      let currentLastChangeAt = await metadataStore.get('lastChangeAt')
      let nextLastChangeAt = null

      if (!currentLastChangeAt) {
        nextLastChangeAt = currentLastChangeAt = new Date()
      }

      // Retrieve local data to sync
      const clientData = []
      let cursor = await syncQueueStore.index('createdAt').openCursor(null, 'prev')
      while (cursor) {
        clientData.push(cursor.value)
        cursor = await cursor.continue()
      }

      // Sync local data with the server
      const serverData = await this.#fetch({
        method: 'POST',
        url: this.syncUrl,
        searchParams: {
          lastChangeAt: currentLastChangeAt
        },
        body: clientData
      })

      // Sync server data locally
      for (const { createdAt, storeName, data } of serverData) {
        const store = await this.openStore(storeName, transaction)
        await store.put(data)

        if (!nextLastChangeAt || isAfterDate(parseDate(createdAt), nextLastChangeAt)) {
          nextLastChangeAt = parseDate(createdAt)
        }
      }

      // Save the last sync date
      if (nextLastChangeAt) {
        await metadataStore.put('lastChangeAt', nextLastChangeAt.toJSON())
      }

      // Clear the queue if not empty
      if (clientToServerData.length) {
        await syncQueueStore.clear()
      }

      this.onSyncSuccess()
    } catch (error) {
      this.onSyncError({ error })
    } finally {
      this.#syncInProgress = false
    }
  }
}
