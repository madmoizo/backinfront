export default {
  storeName: 'User',
  primaryKey: 'id',
  indexes: {
    'lastName,firstName': ['lastName', 'firstName']
  },
  endpoint: '/users',
  routes: [
    'create',
    'list',
    'retrieve',
    'update',
    {
      method: 'GET',
      pathname: '/listDevelopers',
      action: async (ctx, { User }) => {
        return User.findAll({
          where: {
            $and: [
              { status: 'ACTIVATED' },
              { role: 'DEV' }
            ]
          }
        })
      }
    },
    {
      method: 'GET',
      pathname: '/listDevelopersAvailable',
      // Advanced example of user availability for project assignement
      action: async ({ searchParams }, { Project, User }) => {
        const { start, end, projectId } = searchParams

        const projects = await Project.findAll({
          where: {
            $and: [
              // Exclude the current project
              { id: { $notequal: projectId } },
              { developer: { $notequal: null } },
              {
                $or: [
                  // start at the same time
                  { startDate: start },
                  // end at the same time
                  { endDate: end },
                  // include the range
                  {
                    $and: [
                      { startDate: { $lt: start } },
                      { endDate: { $gt: end } }
                    ]
                  },
                  // is included in the range
                  {
                    $and: [
                      { startDate: { $gt: start } },
                      { endDate: { $lt: end } }
                    ]
                  },
                  // starts before and ends during
                  {
                    $and: [
                      { startDate: { $lt: start } },
                      { endDate: { $lt: end, $gt: start } }
                    ]
                  },
                  // starts during and ends after
                  {
                    $and: [
                      { startDate: { $lt: end, $gt: start} },
                      { endDate: { $gt: end } }
                    ]
                  }
                ]
              }
            ]
          }
        })

        const unavailableDevelopers = projects.map(project => project.developer.id)

        return User.findAndCountAll({
          where: {
            $and: [
              { status: 'ACTIVATED' },
              { role: 'DEV' },
              { id: { $notin: [...new Set(unavailableDevelopers)] } }
            ]
          },
          order: ['lastName,firstName', 'ASC']
        })
      }
    }
  ]
}


export default User
