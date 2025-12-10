export const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'INTACT Digital Twin Management Platform API',
    version: '1.0.0',
    description:
      'API for managing cybersecurity services, digital twin projects, scenarios, and infrastructure.',
    contact: {
      name: 'INTACT Project',
      url: 'https://intact-project.eu',
    },
  },
  servers: [
    {
      url: '/api',
      description: 'API Base URL',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
        },
      },
      User: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          username: { type: 'string' },
          role: { type: 'string', enum: ['admin'] },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Service: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          shortName: { type: 'string' },
          title: { type: 'string' },
          categoryId: { type: 'string' },
          provider: { type: 'string' },
          description: { type: 'string' },
          type: { type: 'string', enum: ['Software', 'Hardware', 'Software/Hardware'] },
          repositoryTable: { type: 'string', enum: ['INTACT_TOOLBOX', 'OTHER_SERVICES'] },
        },
      },
      Project: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          shortName: { type: 'string' },
          title: { type: 'string' },
          sector: {
            type: 'string',
            enum: ['Telecommunications', 'Healthcare', 'Transportation', 'Nuclear', 'Cross-Sector'],
          },
          leader: { type: 'string' },
          involvedPartners: { type: 'array', items: { type: 'string' } },
          description: { type: 'string' },
        },
      },
      Scenario: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          projectId: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          topology: { type: 'object' },
          infrastructureId: { type: 'string' },
        },
      },
      Infrastructure: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          name: { type: 'string' },
          type: { type: 'string', enum: ['kubernetes', 'docker', 'virtual'] },
          endpoint: { type: 'string' },
          status: { type: 'string', enum: ['active', 'inactive', 'error'] },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Login to the platform',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['username', 'password'],
                properties: {
                  username: { type: 'string' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Login successful, returns JWT token' },
          401: { description: 'Invalid credentials' },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Authentication'],
        summary: 'Get current user info',
        responses: {
          200: { description: 'Current user info' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/users': {
      get: {
        tags: ['Users'],
        summary: 'List all users',
        responses: {
          200: { description: 'List of users' },
        },
      },
      post: {
        tags: ['Users'],
        summary: 'Create a new user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['username', 'password'],
                properties: {
                  username: { type: 'string' },
                  password: { type: 'string', minLength: 6 },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'User created' },
          409: { description: 'Username already exists' },
        },
      },
    },
    '/users/{id}': {
      delete: {
        tags: ['Users'],
        summary: 'Delete a user',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'User deleted' },
          400: { description: 'Cannot delete own account' },
          404: { description: 'User not found' },
        },
      },
    },
    '/services': {
      get: {
        tags: ['Services'],
        summary: 'List services',
        parameters: [
          {
            name: 'table',
            in: 'query',
            schema: { type: 'string', enum: ['INTACT_TOOLBOX', 'OTHER_SERVICES'] },
          },
          { name: 'category', in: 'query', schema: { type: 'string' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'List of services' },
        },
      },
      post: {
        tags: ['Services'],
        summary: 'Create a service',
        responses: { 201: { description: 'Service created' } },
      },
    },
    '/services/{id}': {
      get: {
        tags: ['Services'],
        summary: 'Get service by ID',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Service details' }, 404: { description: 'Not found' } },
      },
      put: {
        tags: ['Services'],
        summary: 'Update service',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Service updated' } },
      },
      delete: {
        tags: ['Services'],
        summary: 'Delete service',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Service deleted' } },
      },
    },
    '/projects': {
      get: {
        tags: ['Projects'],
        summary: 'List projects',
        responses: { 200: { description: 'List of projects' } },
      },
      post: {
        tags: ['Projects'],
        summary: 'Create a project',
        responses: { 201: { description: 'Project created' } },
      },
    },
    '/projects/{id}': {
      get: {
        tags: ['Projects'],
        summary: 'Get project by ID',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Project details' } },
      },
      put: {
        tags: ['Projects'],
        summary: 'Update project',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Project updated' } },
      },
      delete: {
        tags: ['Projects'],
        summary: 'Delete project',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Project deleted' } },
      },
    },
    '/projects/{projectId}/scenarios': {
      get: {
        tags: ['Scenarios'],
        summary: 'List scenarios for a project',
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'List of scenarios' } },
      },
      post: {
        tags: ['Scenarios'],
        summary: 'Create a scenario',
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 201: { description: 'Scenario created' } },
      },
    },
    '/scenarios/{id}': {
      get: {
        tags: ['Scenarios'],
        summary: 'Get scenario by ID',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Scenario details' } },
      },
      put: {
        tags: ['Scenarios'],
        summary: 'Update scenario',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Scenario updated' } },
      },
      delete: {
        tags: ['Scenarios'],
        summary: 'Delete scenario',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Scenario deleted' } },
      },
    },
    '/scenarios/{id}/execute': {
      post: {
        tags: ['Scenarios'],
        summary: 'Execute a scenario',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Execution started' } },
      },
    },
    '/infrastructures': {
      get: {
        tags: ['Infrastructure'],
        summary: 'List infrastructures',
        responses: { 200: { description: 'List of infrastructures' } },
      },
      post: {
        tags: ['Infrastructure'],
        summary: 'Create infrastructure',
        responses: { 201: { description: 'Infrastructure created' } },
      },
    },
    '/infrastructures/{id}': {
      get: {
        tags: ['Infrastructure'],
        summary: 'Get infrastructure by ID',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Infrastructure details' } },
      },
      put: {
        tags: ['Infrastructure'],
        summary: 'Update infrastructure',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Infrastructure updated' } },
      },
      delete: {
        tags: ['Infrastructure'],
        summary: 'Delete infrastructure',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Infrastructure deleted' } },
      },
    },
    '/infrastructures/{id}/test': {
      post: {
        tags: ['Infrastructure'],
        summary: 'Test infrastructure connection',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Connection test result' } },
      },
    },
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check endpoint',
        security: [],
        responses: { 200: { description: 'Service is healthy' } },
      },
    },
  },
};
