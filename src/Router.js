import isObject from './utils/isObject.js'
import joinPaths from './utils/joinPaths.js'
import urlToRegexp from './utils/urlToRegexp.js'
import processUserInput from './utils/processUserInput.js'


const ROUTES_PRESETS = {
  create: (storeName) => ({
    method: 'POST',
    pathname: '/',
    handler: async ({ body, transaction }, stores) => {
      return stores[storeName].create(body, transaction)
    }
  }),
  list: (storeName) => ({
    method: 'GET',
    pathname: '/',
    handler: async ({ transaction }, stores) => {
      return stores[storeName].findManyAndCount(null, transaction)
    }
  }),
  retrieve: (storeName) => ({
    method: 'GET',
    pathname: '/:primaryKey',
    handler: async ({ pathParams, transaction }, stores) => {
      return stores[storeName].findOne(pathParams.primaryKey, transaction)
    }
  }),
  update: (storeName) => ({
    method: 'PUT',
    pathname: '/:primaryKey',
    handler: async ({ pathParams, body, transaction }, stores) => {
      return stores[storeName].update(pathParams.primaryKey, body, transaction)
    }
  })
}


export default class Router {
  baseUrl = ''
  routes = []

  /**
  * @param {object} options
  * @param {string} options.baseUrl
  * @param {string} options.storeName
  * @param {object} options.routes
  */
  constructor (options = {}) {
    // Throw an error if user input does not match the spec
    processUserInput({
      userInput: options,
      assign: (prop) => this[prop] = options[prop],
      onError: (message) => {
        throw new Error(`[Backinfront][Router:${options.baseUrl}] ${message}`)
      },
      specifications: {
        baseUrl: { type: 'string', required: true },
        routes: { type: 'array', assign: (prop) => this.addRoutes(options[prop]) },
      }
    })
  }

  /**
  * Add a list of routes
  * @param {array<object>} routes
  */
  addRoutes (routes) {
    for (const route of routes) {
      if (
        'storeName' in route &&
        'presets' in route
      ) {
        for (const preset of route.presets) {
          this.addRoute(ROUTES_PRESETS[preset](route.storeName))
        }
      } else {
        this.addRoute(route)
      }
    }
  }

  /**
  * Add a route to the global list
  * @param {object} routeParams
  * @param {string} routeParams.method
  * @param {string} routeParams.pathname
  * @param {function} routeParams.handler
  */
  addRoute ({ method, pathname, handler }) {
    const url = new URL(joinPaths(this.baseUrl, pathname))
    const pathParams = (url.pathname.match(/:[^/]+/g) ?? []).map(tag => tag.replace(':', ''))
    const regexp = new RegExp(`^${url.origin}${url.pathname.replace(/:[^/]+/g, '([a-zA-Z0-9-]+)')}$`)

    this.routes.push({
      specificity: (pathname.split('/').length * 2) - pathParams.length,
      url,
      pathParams,
      regexp,
      method: method.toUpperCase(),
      pathname,
      handler
    })
    this.routes.sort((a, b) => b.specificity - a.specificity)
  }
}
