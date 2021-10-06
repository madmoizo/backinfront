export default {
  baseUrl: 'https://api.example.com/projects',
  store: 'Project',
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

        return Clientfile.findManyAndCount({
          where: where,
          offset: offset,
          limit: limit,
          order: ['createdAt', 'DESC']
        })
      }
    },
    {
      method: 'GET',
      pathname: '/listUnscheduledProjects',
      action: async (ctx, { Project }) => {
        return Project.findMany({
          where: {
            status: 'UNSCHEDULED'
          },
          order: ['createdAt', 'ASC']
        })
      }
    },
    {
      method: 'GET',
      pathname: '/listScheduledProjects',
      action: async ({ searchParams }, { Project }) => {
        const { start, end } = searchParams

        return Project.findMany({
          where: {
            status: 'UNSCHEDULED',
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
      pathname: '/:projectId/accept',
      action: async ({ pathParams, body, transaction }, { Project }) => {
        // if you want to use only one transaction for a list of actions
        // you MUST use the `transaction` member provided by the context
        // in every database method
        const projectData = body
        const project = await Project.findOne(pathParams.projectId, transaction)

        if (!['ACCEPTED'].includes(project.status)) {
          throw new Error(`Project already accepted`)
        }

        projectData.acceptedAt = new Date()
        projectData.status = 'ACCEPTED'

        return Project.update(project.id, projectData, transaction)
      }
    }
  ]
}
