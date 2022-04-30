export default {
  baseUrl: 'https://api.example.com/contacts',
  storeName: 'Contact',
  routes: [
    'create',
    'retrieve',
    'update',
    {
      method: 'GET',
      pathname: '/',
      // Advanced example of contact search implementation on multiple fields
      action: async ({ searchParams }, { Contact }) => {
        const { limit, offset, search } = searchParams

        let where = {}
        let order = ['createdAt', 'DESC']

        if (search) {
          const name = []
          const company = []
          const phone = []
          const words = search.split(' ') // in a real world, you should normalized the search (unaccent, lowercase)

          for (const word of words) {
            name.push({
              $or: [
                { firstName: { $like: word } },
                { lastName: { $like: word } }
              ]
            })
            company.push({
              company: { $like: word }
            })
            phone.push({
              phone: { $like: word }
            })
          }

          where = {
            $or: [
              { $and: name },
              { $and: company },
              { $and: phone }
            ]
          }
          order = ['lastName,firstName', 'ASC']
        }

        return Contact.findManyAndCount({
          where: where,
          offset: offset,
          limit: limit,
          order: order
        })
      }
    }
  ]
}
