
![Logo](/docs/logo.png?raw=true)


# Backinfront

1. [What is this useful for ?](#what-is-this-useful-for-)
2. [Changes](#changes)
3. [Browser support](#browser-support)
4. [Installation](#installation)
5. [API](#api)
   1. [`new Backinfront(options)`](#new-backinfrontoptions)
   1. [`backinfront.populate(storeNames)`](#backinfrontpopulatestoreNames)
   1. [`backinfront.sync()`](#backinfrontsync)
   1. [`backinfront.destroy()`](#backinfrontdestroy)
   1. [`Store object`](#store-object)
   1. [`Router object`](#router-object)
   1. [`Route object`](#route-object)
6. [Example](#example)


# What is this useful for ?

Backinfront is both the manager of your local database and a router which handles requests locally. If you are building an offline first web app which needs sync capabilities, Backinfront is probably the tool your are looking for.

# Changes

[See details of changes](CHANGELOG.md).

# Browser support

This library targets modern browsers, as in Chrome, Firefox, Safari, and other browsers that use those engines, such as Edge. IE is not supported.

If you want to target much older versions of those browsers, you can transpile the library using something like [Babel](https://babeljs.io/).

# Installation

Backinfront is designed to work inside a [Service worker](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) make sure to NOT use it in window context.

```sh
npm install backinfront
```

# API

## new Backinfront(options)

Backinfront accepts a range of options described below

1. [databaseName](#databasename)
1. [stores](#stores)
1. [routers](#routers)
1. [authentication()](#authentication)
1. [populateUrl](#populateurl)
1. [syncUrl](#syncurl)
1. [routeState(request)](#routestaterequest)
1. [formatDataBeforeSave(data)](#formatdatabeforesavedata)
1. [formatRouteSearchParam(searchParam)](#formatroutesearchparamsearchparam)
1. [formatRoutePathParam(pathParam)](#formatroutepathparampathparam)
1. [onRouteSuccess(options)](#onroutesuccessoptions)
1. [onRouteError(options)](#onrouteerroroptions)
1. [onPopulateSuccess()](#onpopulatesuccess)
1. [onPopulateError(options)](#onpopulateerroroptions)
1. [onSyncSuccess()](#onsyncsuccess)
1. [onSyncError(options)](#onsyncerroroptions)

### databaseName

- Description: Name of the indexedDB database
- Type: `string`
- Required

### stores

- Description: List of store objects (see [Store object](#storeobject) for more details)
- Type: `Array<object>`
- Default: []

### routers

- Description: List of router objects (see [Router object](#routerobject) for more details)
- Type: `Array<object>`
- Default: []

### authentication()

- Description: Provides a JWT to authenticate requests on the server
- Type: `function` | `false`
- params: none
- return: `string`

### populateUrl

- Description: url used for database population
- Type: `string`

### syncUrl

- Description: url used for database synchronization
- Type: `string`

### routeState(request)

- Description: Data globally available for all handled requests
- Type: `function`
- params:
  - `request`: [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request)
- return: `object`

### formatDataBeforeSave(data)

- Description: Formats data just before the insertion
- Type: `function`
- params:
  - `data`: object
- return: `object`

### formatRouteSearchParam(searchParam)

- Description: Format search params of a request handled offline
- Type: `function`
- params:
  - `value`: string
- return: `string`
- example: format date string into Date object

### formatRoutePathParam(pathParam)

- Description: Format path params of a request handled offline
- Type: `function`
- params:
  - `value`: string
- return: `string`

### onRouteSuccess(options)

- Description: Hook triggered after a successful offline request
- Type: `function`
- params:
  - `options.route`: `object`
  - `options.result`: `object | Array<object>`
- return: void

### onRouteError(options)

- Description: Hook triggered after a successful offline request
- Type: `function`
- params:
  - `options.route`: `object`
  - `options.error`: [`Error`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error)
- return: void

### onPopulateSuccess()

- Description: Hook triggered after a successful database initial population
- Type: `function`
- params: none
- return: void

### onPopulateError(options)

- Description: Hook triggered after a failure during database initial population
- Type: `function`
- params:
  - `options.error`: [`Error`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error)
- return: void

### onSyncSuccess()

- Description: Hook triggered after a successful database synchronization
- Type: `function`
- params: none
- return: void

### onSyncError(options)

- Description: Hook triggered after a failure during database synchronization
- Type: `function`
- params:
  - `options.error`: [`Error`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error)
- return: void


## backinfront.populate(storeNames)

`populate` sends a `GET` request to the [`populateEndpoint`](#populateendpoint) with a `modelNames` search param which contains the list of models you want to populate.
The server must return an object which match the structure below:
```js
{
  storeName1: [item1, item2, ..., itemX],
  storeName2: [item1, item2, ..., itemX],
  ...
}
```
For performance purpose, don't call `populateDB` with the full list of stores but split it up in multiple calls

## backinfront.sync()

`sync` sends a `POST` request to the [`syncEndpoint`](#syncendpoint).
The `body` is an `array` of `objects` with the following structure:
```js
{
  createdAt,  // date of the modification
  modelName,  // storeName
  primaryKey, // primaryKey of the modified object
  data        // the modified object itself
}
```
The modified data returned by the server must conform to this data structure as well.
To help you return the modified data from the server, the request provide a dedicated search param `lastChangeAt` which match the date of the last object returned by the server.


## backinfront.destroy()

Sometimes, it can be convenient to clear the local data (on user logout for example). The database will be destroyed so you must ensure to stop your sync loop and manually sync a last time before calling `destroy`

## Store object

A store object observe the following structure

1. [storeName](#storeName)
1. [primaryKey](#primaryKey)
1. [indexes](#indexes)

### storeName

- Description: Name of the store
- Type: `string`

### primaryKey

- Description: Name of the primaryKey
- Type: `string` | `Array<string>`

### indexes

- Description: List of indexes
- Type: `object`
- Example:
```js
indexes: {
  indexName1: indexKey1
  indexName2: [indexKey2, indexKey3]
}
```

## Router object

A router object observe the following structure

1. [baseUrl](#baseurl)
1. [routes](#routes)

### baseUrl

- Description: base url used to prefix routes
- Type: `string`

### routes

- Description: List of routes handled offline (see [Route Object](#route-object) and [Autoroute Object](#autoroute-object) for more details)
- Type: `Array<Route|Autoroute>`

## Route object

A Route object observe the following structure

1. [method](#method)
1. [pathname](#pathname)
1. [handler(ctx,stores)](#handlerctxstores)

### method

- Description: method of the request
- Type: `GET | PUT | POST | PATCH | DELETE`

### pathname

- Description: Part of the url after the [baseUrl](#baseurl). You can specify `pathParams` by prefixing part of the url with `:`
- Type: `string`

### handler(ctx,stores)

- Description: action to perform
- Type: `function`
- params:
  - ctx: `{ state, request, searchParams, pathParams, body, transaction }`
  - stores: object containing all stores with [storeName](#storename) as a key `{ Store1, Store2, Store10 }`

## Autoroute object

An Autoroute object observe the following structure

1. [storeName](#storeName)
1. [presets](#presets)

### storeName

- Description: Name of a store
- Type: `string`

### presets

- Description: List of presets names
- Type: `Array<create|list|retrieve|update>`

# Example

What is better than [a real example](/example) to show the full capabilities of Backinfront?
