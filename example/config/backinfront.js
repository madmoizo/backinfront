import Backinfront from '../../src/backinfront/index.js'

import UserStore from '../stores/User.js'
import ContactStore from '../stores/Contact.js'
import ProjectStore from '../stores/Project.js'
import usersRouter from '../routers/users.js'
import contactsRouter from '../routers/contacts.js'
import projectsRouter from '../routers/projects.js'


const backinfront = new Backinfront({
  databaseName: 'mydatabase',
  stores: [
    UserStore,
    ContactStore,
    ProjectStore
  ],
  routers: [
    usersRouter,
    contactsRouter,
    projectsRouter
  ],
  populateUrl: 'https://api.example.com/offline/populate',
  syncUrl: 'https://api.example.com/offline/sync',
  authentication: () => {
    return // retrieve your user's JWT from indexedDB
  },
  // For example, you can provide the JWT from the
  // handled request in the global state
  routeState: (request) => {
    const state = {}
    const authorizationHeader = request.headers.get('Authorization')
    state.encodedToken = authorizationHeader.split(' ')[1]
    return state
  },
  // If you use undashed uuid as a path param, you can redash it here
  formatRoutePathParam: (value) => {
    return redashUUID(value)
  },
  // Search params are always string, so you can transform a list to an array
  // Or a date string to a javascript Date, ...
  formatRouteSearchParam: (value) => {
    const valueAsArray = value.split(',')
    return valueAsArray.length > 1
      ? valueAsArray
      : value
  },
  // It's the default, feel free to overwrite it
  formatDataBeforeSave: () => {
    return JSON.parse(JSON.stringify(data))
  },
  onRouteError: ({ route, error }) => {
    console.warn(`[Backinfront][RouteError] ${route.url.href}`, error)
  },
  onRouteSuccess: ({ route, result }) => {
    console.info(`[Backinfront][RouteSuccess] ${route.url.href}`, result)
  },
  onPopulateSuccess: () => {
    console.warn('[Backinfront][PopulateSuccess]')
  },
  onPopulateError: ({ error }) => {
    console.warn('[Backinfront][PopulateError]', error)
  },
  onSyncSuccess: () => {
    console.warn('[Backinfront][SyncSuccess]')
  },
  onSyncError: ({ error }) => {
    console.warn('[Backinfront][SyncError]', error)
  }
})


// Export some store for direct use in your code
export const {
  User
} = backinfront.stores
export default backinfront
