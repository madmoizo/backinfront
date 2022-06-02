export { openDB, deleteDB } from 'idb'

/**
 * Check if a database already exists
 * @param {string} databaseName
 * @returns {boolean}
 */
export async function DBExists (databaseName) {
  const databases = await indexedDB.databases()
  return databases.some(database => database.name === databaseName)
}

/**
 * @param {IDBTransaction} transaction
 * @param {object} options
 * @param {string} options.storeName
 * @param {string} options.keyPath
 */
export function createStore (transaction, { storeName, keyPath }) {
  transaction.db.createObjectStore(storeName, { keyPath }) // nullish keyPath is ignored
}

/**
 * @param {IDBTransaction} transaction
 * @param {object} options
 * @param {string} options.storeName
 */
export function deleteStore (transaction, { storeName }) {
  transaction.db.deleteObjectStore(storeName)
}

/**
 * @param {IDBTransaction} transaction
 * @param {object} options
 * @param {string} options.storeName
 * @param {string} options.indexName
 * @param {string} options.indexKeyPath
 */
export function createIndex (transaction, { storeName, indexName, indexKeyPath }) {
  transaction.objectStore(storeName).createIndex(indexName, indexKeyPath)
}

/**
 * @param {IDBTransaction} transaction
 * @param {object} options
 * @param {string} options.storeName
 * @param {string} options.indexName
 */
export function deleteIndex (transaction, { storeName, indexName }) {
  transaction.objectStore(storeName).deleteIndex(indexName)
}
