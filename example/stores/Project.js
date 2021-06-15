export default {
  storeName: 'Project',
  primaryKey: 'id',
  indexes: {
    'createdAt': 'createdAt'
  },
  endpoint: '/private/projects',
  routes: [
    'retrieve',
    'update',
    {
      method: 'GET',
      pathname: '/',
      action: async ({ searchParams }, { Clientfile }) => {
        const { limit, offset, search } = searchParams

        let where = {}

        if (search) {
          const number = []
          const orderGiverName = []
          const words = search.split(' ') // in a real world, you should normalized the search (unaccent, lowercase)

          for (const word of words) {
            number.push({
              number: { $like: word }
            })
            orderGiverName.push({
              $or: [
                { 'author.firstName': { $like: word } },
                { 'author.lastName': { $like: word } }
              ]
            })
          }

          where = {
            $or: [
              { $and: number },
              { $and: orderGiverName }
            ]
          }
        }

        return Clientfile.findAndCountAll({
          where: where,
          offset: offset,
          limit: limit,
          order: ['createdAt', 'DESC']
        })
      }
    },
    {
      method: 'GET',
      pathname: '/listProjectsUnscheduled',
      action: async (ctx, { Project }) => {
        return Project.findAll({
          where: {
            status: 'UNSCHEDULED'
          },
          order: ['createdAt', 'ASC']
        })
      }
    },
    {
      method: 'GET',
      pathname: '/listProjectsScheduled',
      action: async ({ searchParams }, { Project }) => {
        const { start, end } = searchParams

        return Project.findAll({
          where: {
            startDate: {
              $gte: start,
              $lte: end
            }
          }
        })
      }
    },
    {
      method: 'PUT',
      pathname: '/:projectId/acceptQuote',
      action: async ({ pathParams, body, transaction }, { Project }) => {
        const projectData = body
        const project = await Project.findOne(pathParams.projectId, transaction)

        if (!['ACCEPTED'].includes(project.status)) {
          throw new Error(`Project already accepted`)
        }

        projectData.acceptedAt = new Date()
        projectData.status = 'ACCEPTED'

        return Project.update(project.id, projectData, transaction) // Use the transaction provided in the context for every write operation
      }
    }
  ]
}
