export default {
  storeName: 'Contact',
  primaryKey: 'id',
  indexes: {
    'lastName,firstName': ['lastName', 'firstName']
  }
}
