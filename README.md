![Logo](/static/logo.png?raw=true)

# Backinfront

1. [What is this useful for ?](#what-is-this-useful-for-)
3. [Browser support](#browser-support)
4. [Installation](#installation)
2. [Changes](#changes)
5. [Usage](#api)
6. [Example](#example)


# What is this useful for ?

Backinfront is both the manager of your browser database and a router which handles requests locally. If you are building an offline first web app which needs sync capabilities, Backinfront is probably the tool your are looking for.

# Browser support

This library targets modern browsers, as in Chrome, Firefox, Safari, and other browsers that use those engines, such as Edge. IE is not supported. If you have to target much older versions of those browsers, you can still use a transpiler.

# Changes

See the [CHANGELOG](CHANGELOG.md) to be the first to use the new features and to stay up to date with breaking changes

# Installation

```sh
npm install backinfront
```

# Usage

Backinfront is designed to work inside a [Service worker](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) make sure to NOT use it in window context.

```js
import Backinfront from 'backinfront'


const backinfront = new Backinfront({
  // Name of the indexedDB database
  databaseName: string,
  // List of stores
  stores: Array<{
    // Name of the store
    storeName: string,
    // Name of the primaryKey
    primaryKey: string,
    // List of indexes
    indexes: {
      [indexName: string]: string | Array<string>
    }
  }>,
  // List of routers
  routers: Array<{
    baseUrl: string,
    routes: Array<{
        // Method of the request
        method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        // Part of the url after the `baseUrl`
        // You can specify a `pathParam` by prefixing part of the url with `:`
        pathname: string,
        // Action performed locally
        handler(
          context: {
            request: Request,
            transaction: IDBTransaction,
            // Date returned by `routeState` function
            state: { [globalData: string]: any },
            // Search param after being formatted by `formatRouteSearchParam`
            searchParams: { [searchParams: string]: string | any },
            // Path param after being formatted by `formatRoutePathParam`
            pathParams: { [pathParam: string]: string | any },
            // Body of the request (null if method is GET)
            body: null | object | Array<object>
          },
          stores: {
            [storeName: string]: Store
          }
        ): object | Array<object>
      } | {
        // Name of a store
        storeName: string,
        // Preset routes
        presets: Array<'create' | 'list' | 'retrieve' | 'update'>
      }
    >
  }>,
  // URL used for database population
  populateUrl: string,
  // URL used for database synchronization
  syncUrl: string,
  // Provides a JWT to authenticate requests on the server
  authentication?: false,
  authentication?(): string,
  // Add data to context of offline handled routes
  routeState?(request: Request): object,
  // Formats data just before the insertion
  formatDataBeforeSave?(data: object): object,
  // Format a search param of a request handled offline
  // Example: convert date string to Date, comma separated list to Array, ...
  formatRouteSearchParam?(searchParam: string): any,
  // Format path params of a request handled offline
  formatRoutePathParam?(pathParam: string): any,
  // Hook triggered after a successful offline request
  onRouteSuccess?({ route: object, result: object | Array<object> }): void,
  // Hook triggered after a failed offline request
  onRouteError?({ route: object, error: Error }): void,
  // Hook triggered after a successful database initial population
  onPopulateSuccess?(): void,
  // Hook triggered after a failure during database initial population
  onPopulateError?({ error: Error }): void,
  // Hook triggered after a successful database synchronization
  onSyncSuccess?(): void,
  // Hook triggered after a failure during database synchronization
  onSyncError?({ error: Error }): void
})

/*
  Perform a fetch request to the `populateUrl`
  Request
  {
    method: 'GET',
    searchParams: {
      storeNames: ['storename1', ... , 'storeNameX']
    }
  }
  Response expected from the server
  {
    storeName1: [item1, ..., itemX],
    ...,
    storeNameX: [item1, ..., itemX],
  }
*/
backinfront.populate(storeNames: Array<string>)

/*
  Perform a fetch request to the `syncUrl`
  Request
  {
    method: 'POST',
    searchParams: {
      lastChangeAt // date of the last object returned by the server
    },
    body: [
      {
        createdAt,
        storeName,
        primaryKey,
        data
      }, ...
    ]
  }
  Response
  [
    {
      createdAt,
      storeName,
      primaryKey,
      data
    }, ...
  ]
  Note: 
  The recommended way to use the sync capability is to send a message periodically 
  from the window context which will trigger this function
*/
backinfront.sync()

/*
  Destroy the local database
  Sometimes, it can be convenient to clear the local data (on user logout for example).
  The database will be destroyed so you must ensure to stop your sync loop
  and manually call the sync function a last time before calling destroy.
*/
backinfront.destroy()


//
// Stores provide a useful api which allows local data manipulation
//
const store = backinfront.stores[storeName]

// Delete all elements from the store
await store.clear(transaction?: IDBTransaction)
// Delete the element matching the primaryKey value from the store
await store.delete(primaryKeyValue: any, transaction?: IDBTransaction)
// Add a new item to the store
await store.create(data: object, transaction?: IDBTransaction)
// Update an existing item from the store
await store.update(primaryKeyValue: any, data: object, transaction?: IDBTransaction)
// Count the total of items in the store
await store.count(transaction?: IDBTransaction)
// Find an item by it's primaryKey value
await store.findOne(primaryKeyValue, transaction?: IDBTransaction)
// Find a list of items matching the provided condition
await store.findManyAndCount(condition?: object, transaction?: IDBTransaction)
await store.findMany(condition?: object, transaction?: IDBTransaction)

//
// To build the `condition` used by findMany and findManyAndCount
// You can use the powerful query language provided by the lib
//
await store.findManyAndCount({
  where: {
    // $and & $or expect an array of condition 
    $or: [
      { $and: [] },
      { $and: [] }
    ],
    // $and is implicit when there are multiples conditions side by side
    property1: value1,
    property2: value2,
    // But you can use it if you want to
    $and: [
      { property1: value1 },
      { property2: value2 }
    ]
    // Dot notation is also supported to access nested object
    'grandma.mum.me': value
    // List of operators
    property: value, // 1
    property: { $equal: value }, // equivalent to 1
    property: { $gt: value },
    property: { $gte: value },
    property: { $lt: value },
    property: { $lte: value },
    property: { $in: [value1, ...,  valueX] },
    property: { $notin: [value1, ..., valueX] },
    property: { $like: [normalize, value] }, // use normalize function to apply a transformation to value & store value
    property: { $some: (element) => element === value }, // will always return false if the store value is not an array
    property: { $function: (storeValue) => storeValue === value } // This example reproduce $equal condition
  },
  limit: number,
  offset: number,
  // You can only order by an existing index
  order: ['indexName', 'DESC'] 
})
```

# Example

Something is still unclear? What is better than [a real example](/example) to show you the full capabilities of Backinfront !
