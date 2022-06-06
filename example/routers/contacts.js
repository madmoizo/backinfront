export default {
  baseUrl: 'https://api.example.com/contacts',
  routes: [
    {
      storeName: 'Contact',
      presets: ['create', 'retrieve', 'update']
    },
    {
      method: 'GET',
      pathname: '/',
      // Advanced example of contact search implementation on multiple fields
      handler: async ({ searchParams }, { Contact }) => {
        const { limit, offset, search } = searchParams

        let where = {}
        let order = ['createdAt', 'DESC']

        if (search) {
          const name = []
          const company = []
          const phone = []
          const words = search.split(' ')

          const normalize = (value) => {
            value.toLowerCase()
          }

          for (const word of words) {
            name.push({
              $or: [
                { firstName: { $like: [normalize, word] } },
                { lastName: { $like: [normalize, word] } }
              ]
            })
            company.push({
              company: { $like: [normalize, word] }
            })
            phone.push({
              phone: { $like: [normalize, word] }
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
          where,
          offset,
          limit,
          order
        })
      }
    }
  ]
}
