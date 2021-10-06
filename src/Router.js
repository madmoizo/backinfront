import isObject from './utils/isObject.js'
import checkUserInput from './utils/checkUserInput.js'
import urlToRegexp from './utils/urlToRegexp.js'
import joinPaths from './utils/joinPaths.js'


export default class Router {
  baseUrl
  routes = []
  storeName
  #predefinedRoutes = {
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
      action: async ({ transaction }, stores) => {
        return stores[this.storeName].findManyAndCount(null, transaction)
      }
    },
    'retrieve': {
      method: 'GET',
      pathname: '/:primaryKey',
      action: async ({ pathParams, transaction }, stores) => {
        return stores[this.storeName].findOne(pathParams.primaryKey, transaction)
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

  /**
  * @param {object} options
  * @param {string} options.baseUrl
  * @param {string} options.storeName
  * @param {Array<'create'|'list'|'retrieve'|'update'|object>} options.routes
  */
  constructor (options = {}) {
    // Throw an error if user input does not match the spec
    checkUserInput(options, {
      baseUrl: { type: 'string', required: true },
      storeName: { type: 'string' },
      routes: { type: 'array' },
    }, `[Backinfront][Router:${options.baseUrl}]`)

    this.baseUrl = options.baseUrl

    if ('storeName' in options) {
      this.storeName = options.storeName
    }

    if ('routes' in options) {
      for (const route of options.routes) {
        if (isObject(route)) {
          this.addRoute(route)
        } else if (route in this.#predefinedRoutes && this.storeName) {
          this.addRoute(this.#predefinedRoutes[route])
        }
      }
    }
  }

  /**
  * Add a route to the global list
  * @param {object} routeParams
  * @param {string} routeParams.method
  * @param {string} routeParams.pathname
  * @param {function} routeParams.action
  */
  addRoute ({ method, pathname, action }) {
    const urlString = joinPaths(this.baseUrl, pathname)
    const routeRegexp = urlToRegexp(urlString)

    this.routes.push({
      method: method.toUpperCase(),
      pathname: pathname,
      action: action,
      specificity: (pathname.split('/').length * 2) - routeRegexp.pathParams.length,
      ...routeRegexp,
    })
    this.routes.sort((a, b) => b.specificity - a.specificity)
  }
}
