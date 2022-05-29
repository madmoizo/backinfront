import { joinPaths, mergeObject, typecheck } from 'utililib'


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
  origin = ''
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
    typecheck({
      options: {
        value: options,
        type: ['object', {
          baseUrl: { type: 'string', required: true },
          routes: { type: 'array' }
        }]
      }
    })

    mergeObject({
      source: options,
      target: this,
      exceptions: {
        routes: (value) => this.addRoutes(value)
      }
    })

    this.origin = new URL(this.baseUrl).origin
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
    const url = new URL(joinPaths(this.baseUrl, pathname, '/')) // /!\ force a trailing slash /!\
    // Extract path params from url
    const pathParams = (url.pathname.match(/:[^/]+/g) ?? []).map(tag => tag.replace(':', ''))
    // replace user defined path params with regex expression
    const regexp = new RegExp(`^${url.origin}${url.pathname.replace(/:[^/]+/g, '([a-zA-Z0-9-]+)')}?$`) // /!\ the ? ignore the trailing slash /!\
    // Specificity is a code
    const parts = url.pathname.match(/[^/]+/g)
    const specificity = `1${parts.map(part => part.startsWith(':') ? '0' : '1').join('')}`
    const length = parts.length

    this.routes.push({
      method: method.toUpperCase(),
      url,
      pathParams,
      handler,
      // Params used for filtering
      regexp,
      specificity,
      length
    })
  }
}
