import * as idbKeyval from 'idb-keyval' // we are using idbKeyval as an async key-value storage
import backinfront from './backinfront.js'


async function postMessage (message) {
  // https://developer.mozilla.org/fr/docs/Web/API/Clients/matchAll
  const windows = await clients.matchAll({ type: 'window' })

  for (const window of windows) {
    window.postMessage({ action: message })
  }
}


const messages = {
  'window:auth:login': async (data) => {
    await postMessage(`sw:auth:login:start`)

    // Persist auth token
    await idbKeyval.set('token', data.encodedToken)

    // Populate essential store before
    await backinfront.populate(['User', 'Project'])

    await postMessage(`sw:auth:login:end`)

    // Populate non essential store after
    await backinfront.populate(['Contact'])
  },
  'window:auth:logout': async (data) => {
    await postMessage(`sw:auth:logout:start`)
    await idbKeyval.clear()
    await backinfront.destroy()
    await postMessage(`sw:auth:logout:end`)
  },
  // you must let the window control the sync loop
  // because it will force the service worker to be up
  'window:sync': async () => {
    await backinfront.sync()
  }
}


self.addEventListener('message', async (event) => {
  try {
    await messages[event.data.action](event.data)
  } catch (error) {
    console.warn(`[SW][Message] Error during \`${event.data.action}\` processing`, error)
  }
})
