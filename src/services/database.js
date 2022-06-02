export { openDB, deleteDB } from 'idb'


/**
 * @param {IDBTransaction} transaction
 * @param {string} storeName
 * @param {string | Array<string>} keyPath
 */
export function createStore (transaction, storeName, keyPath) {
  transaction.db.createObjectStore(storeName, { keyPath }) // nullish keyPath is ignored
}

/**
 * @param {IDBTransaction} transaction
 * @param {string} storeName
 */
export function deleteStore (transaction, storeName) {
  transaction.db.deleteObjectStore(storeName)
}

/**
 * @param {IDBTransaction} transaction
 * @param {string} storeName
 * @param {string} indexName
 * @param {string | Array<string>} indexKeyPath
 */
export function createIndex (transaction, storeName, indexName, indexKeyPath) {
  transaction.objectStore(storeName).createIndex(indexName, indexKeyPath)
}

/**
 * @param {IDBTransaction} transaction
 * @param {string} storeName
 * @param {string} indexName
 */
export function deleteIndex (transaction, storeName, indexName) {
  transaction.objectStore(storeName).deleteIndex(indexName)
}
