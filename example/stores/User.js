export default {
  storeName: 'User',
  primaryKey: 'id',
  indexes: {
    'lastName,firstName': ['lastName', 'firstName']
  }
}
