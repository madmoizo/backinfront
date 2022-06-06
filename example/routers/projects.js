export default {
  baseUrl: 'https://api.example.com/projects',
  routes: [
    {
      storeName: 'Project',
      presets: ['retrieve', 'update']
    },
    {
      method: 'GET',
      pathname: '/',
      handler: async ({ searchParams }, { Clientfile }) => {
        const { limit, offset, search } = searchParams

        let where = {}

        if (search) {
          const number = []
          const orderGiverName = []
          const words = search.split(' ')

          const normalize = (value) => {
            value.toLowerCase()
          }

          for (const word of words) {
            number.push({
              number: { $like: [normalize, word] }
            })
            orderGiverName.push({
              $or: [
                { 'author.firstName': { $like: [normalize, word] } },
                { 'author.lastName': { $like: [normalize, word] } }
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
          where,
          offset,
          limit,
          order: ['createdAt', 'DESC']
        })
      }
    },
    {
      method: 'GET',
      pathname: '/listUnscheduledProjects',
      handler: async (ctx, { Project }) => {
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
      handler: async ({ searchParams }, { Project }) => {
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
      handler: async ({ pathParams, body, transaction }, { Project }) => {
        // if you want to use only one transaction for a list of actions
        // you MUST use the `transaction` member provided by the context
        // in every database method
        const projectData = body
        const project = await Project.findOne(pathParams.projectId, transaction)

        if (!['ACCEPTED'].includes(project.status)) {
          return Response(undefined, {
            status: 304,
            statusText: 'Project already accepted'
          })
        }

        projectData.acceptedAt = new Date()
        projectData.status = 'ACCEPTED'

        return Project.update(project.id, projectData, transaction)
      }
    }
  ]
}
