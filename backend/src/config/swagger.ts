import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'TradeVault API',
      version: '1.0.0',
      description: 'REST API for TradeVault — a personal crypto trade tracking application.',
    },
    servers: [{ url: 'http://localhost:5000/api/v1', description: 'Local development server' }],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'token',
          description: 'JWT stored in an httpOnly cookie named `token`.',
        },
      },
      schemas: {
        // ── Envelopes ──────────────────────────────────────────────────────────
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Success' },
            data: {},
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', example: 'Human-readable error message' },
            code: {
              type: 'string',
              enum: [
                'VALIDATION_ERROR',
                'INVALID_CREDENTIALS',
                'UNAUTHORIZED',
                'FORBIDDEN',
                'NOT_FOUND',
                'CONFLICT',
                'INTERNAL_ERROR',
              ],
              example: 'VALIDATION_ERROR',
            },
          },
        },

        // ── Auth ───────────────────────────────────────────────────────────────
        RegisterRequest: {
          type: 'object',
          required: ['name', 'email', 'password'],
          properties: {
            name: {
              type: 'string',
              minLength: 2,
              maxLength: 50,
              example: 'Alice Trader',
            },
            email: {
              type: 'string',
              format: 'email',
              example: 'alice@example.com',
            },
            password: {
              type: 'string',
              minLength: 8,
              description: 'Must contain at least 1 uppercase letter and 1 digit.',
              example: 'Secret@99',
            },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'alice@example.com' },
            password: { type: 'string', example: 'Secret@99' },
          },
        },
        UserData: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '665f1a2b3c4d5e6f7a8b9c0d' },
            name: { type: 'string', example: 'Alice Trader' },
            email: { type: 'string', example: 'alice@example.com' },
            role: { type: 'string', enum: ['USER', 'ADMIN'], example: 'USER' },
          },
        },

        // ── Trade ──────────────────────────────────────────────────────────────
        TradeRequest: {
          type: 'object',
          required: ['coin', 'type', 'entryPrice', 'quantity', 'status', 'tradeDate'],
          properties: {
            coin: {
              type: 'string',
              minLength: 1,
              maxLength: 10,
              example: 'BTC',
            },
            type: { type: 'string', enum: ['BUY', 'SELL'], example: 'BUY' },
            entryPrice: { type: 'number', minimum: 0.000001, example: 60000 },
            exitPrice: {
              type: 'number',
              minimum: 0.000001,
              nullable: true,
              example: 65000,
            },
            quantity: { type: 'number', minimum: 0.000001, example: 0.5 },
            status: { type: 'string', enum: ['OPEN', 'CLOSED'], example: 'CLOSED' },
            notes: {
              type: 'string',
              maxLength: 500,
              nullable: true,
              example: 'Breakout trade above resistance.',
            },
            tradeDate: {
              type: 'string',
              format: 'date-time',
              example: '2024-06-01T10:00:00.000Z',
            },
          },
        },
        TradeData: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '665f1a2b3c4d5e6f7a8b9c0e' },
            userId: { type: 'string', example: '665f1a2b3c4d5e6f7a8b9c0d' },
            coin: { type: 'string', example: 'BTC' },
            type: { type: 'string', enum: ['BUY', 'SELL'], example: 'BUY' },
            entryPrice: { type: 'number', example: 60000 },
            exitPrice: { type: 'number', nullable: true, example: 65000 },
            quantity: { type: 'number', example: 0.5 },
            status: { type: 'string', enum: ['OPEN', 'CLOSED'], example: 'CLOSED' },
            pnl: { type: 'number', nullable: true, example: 2500 },
            pnlPercent: { type: 'number', nullable: true, example: 8.33 },
            notes: { type: 'string', nullable: true, example: 'Breakout trade above resistance.' },
            tradeDate: { type: 'string', format: 'date-time', example: '2024-06-01T10:00:00.000Z' },
            createdAt: { type: 'string', format: 'date-time', example: '2024-06-01T10:05:00.000Z' },
            updatedAt: { type: 'string', format: 'date-time', example: '2024-06-01T10:05:00.000Z' },
          },
        },

        // ── Admin ──────────────────────────────────────────────────────────────
        AdminUserData: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '665f1a2b3c4d5e6f7a8b9c0d' },
            name: { type: 'string', example: 'Alice Trader' },
            email: { type: 'string', example: 'alice@example.com' },
            role: { type: 'string', enum: ['USER', 'ADMIN'], example: 'USER' },
            createdAt: { type: 'string', format: 'date-time', example: '2024-05-01T08:00:00.000Z' },
            tradeCount: { type: 'integer', example: 6 },
          },
        },
      },

      // ── Reusable error responses ─────────────────────────────────────────────
      responses: {
        Unauthorized: {
          description: 'Missing or invalid JWT cookie.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' },
            },
          },
        },
        Forbidden: {
          description: 'Authenticated but insufficient role.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { success: false, error: 'Forbidden', code: 'FORBIDDEN' },
            },
          },
        },
        NotFound: {
          description: 'Resource not found or ownership mismatch.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { success: false, error: 'Not found', code: 'NOT_FOUND' },
            },
          },
        },
        ValidationError: {
          description: 'Request body failed schema validation.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { success: false, error: 'Invalid email address', code: 'VALIDATION_ERROR' },
            },
          },
        },
        InternalError: {
          description: 'Unexpected server error.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' },
            },
          },
        },
      },
    },

    // ── Paths ────────────────────────────────────────────────────────────────
    paths: {
      // ── Auth ────────────────────────────────────────────────────────────────
      '/auth/register': {
        post: {
          tags: ['Auth'],
          summary: 'Register a new user',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/RegisterRequest' } },
            },
          },
          responses: {
            201: {
              description: 'User created successfully.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SuccessResponse' },
                  example: {
                    success: true,
                    message: 'Registered successfully',
                    data: {
                      id: '665f1a2b3c4d5e6f7a8b9c0d',
                      name: 'Alice Trader',
                      email: 'alice@example.com',
                      role: 'USER',
                    },
                  },
                },
              },
            },
            400: { $ref: '#/components/responses/ValidationError' },
            409: {
              description: 'Email already registered.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                  example: { success: false, error: 'Email already in use', code: 'CONFLICT' },
                },
              },
            },
          },
        },
      },

      '/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Log in and receive a session cookie',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } },
            },
          },
          responses: {
            200: {
              description: 'Login successful. Sets httpOnly `token` cookie.',
              headers: {
                'Set-Cookie': {
                  description: 'httpOnly JWT cookie (name: token, 7-day expiry).',
                  schema: { type: 'string' },
                },
              },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SuccessResponse' },
                  example: {
                    success: true,
                    message: 'Success',
                    data: {
                      id: '665f1a2b3c4d5e6f7a8b9c0d',
                      name: 'Alice Trader',
                      email: 'alice@example.com',
                      role: 'USER',
                    },
                  },
                },
              },
            },
            400: { $ref: '#/components/responses/ValidationError' },
            401: {
              description: 'Invalid email or password.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                  example: {
                    success: false,
                    error: 'Invalid email or password',
                    code: 'INVALID_CREDENTIALS',
                  },
                },
              },
            },
          },
        },
      },

      '/auth/logout': {
        post: {
          tags: ['Auth'],
          summary: 'Log out and clear the session cookie',
          security: [{ cookieAuth: [] }],
          responses: {
            200: {
              description: 'Logged out successfully.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SuccessResponse' },
                  example: { success: true, message: 'Logged out successfully', data: null },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },

      '/auth/me': {
        get: {
          tags: ['Auth'],
          summary: 'Get the currently authenticated user',
          security: [{ cookieAuth: [] }],
          responses: {
            200: {
              description: 'Current user data (no password).',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SuccessResponse' },
                  example: {
                    success: true,
                    message: 'Success',
                    data: {
                      id: '665f1a2b3c4d5e6f7a8b9c0d',
                      name: 'Alice Trader',
                      email: 'alice@example.com',
                      role: 'USER',
                    },
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },

      // ── Trades ──────────────────────────────────────────────────────────────
      '/trades': {
        get: {
          tags: ['Trades'],
          summary: 'Get all trades for the authenticated user',
          security: [{ cookieAuth: [] }],
          responses: {
            200: {
              description: 'Array of trades belonging to the authenticated user.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SuccessResponse' },
                  example: {
                    success: true,
                    message: 'Success',
                    data: [
                      {
                        _id: '665f1a2b3c4d5e6f7a8b9c0e',
                        userId: '665f1a2b3c4d5e6f7a8b9c0d',
                        coin: 'BTC',
                        type: 'BUY',
                        entryPrice: 60000,
                        exitPrice: 65000,
                        quantity: 0.5,
                        status: 'CLOSED',
                        pnl: 2500,
                        pnlPercent: 8.33,
                        notes: 'Breakout trade.',
                        tradeDate: '2024-06-01T10:00:00.000Z',
                        createdAt: '2024-06-01T10:05:00.000Z',
                        updatedAt: '2024-06-01T10:05:00.000Z',
                      },
                    ],
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
        post: {
          tags: ['Trades'],
          summary: 'Create a new trade',
          security: [{ cookieAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/TradeRequest' } },
            },
          },
          responses: {
            201: {
              description: 'Trade created. P&L fields are populated for CLOSED trades.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SuccessResponse' },
                  example: {
                    success: true,
                    message: 'Trade created',
                    data: {
                      _id: '665f1a2b3c4d5e6f7a8b9c0e',
                      userId: '665f1a2b3c4d5e6f7a8b9c0d',
                      coin: 'BTC',
                      type: 'BUY',
                      entryPrice: 60000,
                      exitPrice: 65000,
                      quantity: 0.5,
                      status: 'CLOSED',
                      pnl: 2500,
                      pnlPercent: 8.33,
                      notes: 'Breakout trade.',
                      tradeDate: '2024-06-01T10:00:00.000Z',
                      createdAt: '2024-06-01T10:05:00.000Z',
                      updatedAt: '2024-06-01T10:05:00.000Z',
                    },
                  },
                },
              },
            },
            400: { $ref: '#/components/responses/ValidationError' },
            401: { $ref: '#/components/responses/Unauthorized' },
            500: { $ref: '#/components/responses/InternalError' },
          },
        },
      },

      '/trades/{id}': {
        get: {
          tags: ['Trades'],
          summary: 'Get a single trade by ID',
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string', example: '665f1a2b3c4d5e6f7a8b9c0e' },
              description: 'MongoDB ObjectId of the trade.',
            },
          ],
          responses: {
            200: {
              description: 'Trade found and belongs to the authenticated user.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SuccessResponse' },
                  example: {
                    success: true,
                    message: 'Success',
                    data: {
                      _id: '665f1a2b3c4d5e6f7a8b9c0e',
                      coin: 'ETH',
                      type: 'SELL',
                      entryPrice: 3500,
                      exitPrice: null,
                      quantity: 2,
                      status: 'OPEN',
                      pnl: null,
                      pnlPercent: null,
                    },
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            404: { $ref: '#/components/responses/NotFound' },
          },
        },
        put: {
          tags: ['Trades'],
          summary: 'Update a trade',
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string', example: '665f1a2b3c4d5e6f7a8b9c0e' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/TradeRequest' } },
            },
          },
          responses: {
            200: {
              description: 'Trade updated. P&L is recalculated when transitioning to CLOSED.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SuccessResponse' },
                  example: {
                    success: true,
                    message: 'Trade updated',
                    data: {
                      _id: '665f1a2b3c4d5e6f7a8b9c0e',
                      coin: 'ETH',
                      type: 'SELL',
                      entryPrice: 3500,
                      exitPrice: 3200,
                      quantity: 2,
                      status: 'CLOSED',
                      pnl: 600,
                      pnlPercent: 8.57,
                    },
                  },
                },
              },
            },
            400: { $ref: '#/components/responses/ValidationError' },
            401: { $ref: '#/components/responses/Unauthorized' },
            404: { $ref: '#/components/responses/NotFound' },
          },
        },
        delete: {
          tags: ['Trades'],
          summary: 'Delete a trade',
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string', example: '665f1a2b3c4d5e6f7a8b9c0e' },
            },
          ],
          responses: {
            200: {
              description: 'Trade deleted.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SuccessResponse' },
                  example: {
                    success: true,
                    message: 'Trade deleted',
                    data: { id: '665f1a2b3c4d5e6f7a8b9c0e' },
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            404: { $ref: '#/components/responses/NotFound' },
          },
        },
      },

      // ── Admin ────────────────────────────────────────────────────────────────
      '/admin/users': {
        get: {
          tags: ['Admin'],
          summary: 'Get all users with trade counts (ADMIN only)',
          security: [{ cookieAuth: [] }],
          responses: {
            200: {
              description: 'List of all users including their trade count.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SuccessResponse' },
                  example: {
                    success: true,
                    message: 'Success',
                    data: [
                      {
                        id: '665f1a2b3c4d5e6f7a8b9c0d',
                        name: 'Alice Trader',
                        email: 'alice@example.com',
                        role: 'USER',
                        createdAt: '2024-05-01T08:00:00.000Z',
                        tradeCount: 6,
                      },
                    ],
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
          },
        },
      },

      '/admin/users/{id}': {
        delete: {
          tags: ['Admin'],
          summary: 'Delete a user and all their trades (ADMIN only)',
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string', example: '665f1a2b3c4d5e6f7a8b9c0d' },
              description: 'MongoDB ObjectId of the user to delete.',
            },
          ],
          responses: {
            200: {
              description: 'User and all associated trades deleted.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SuccessResponse' },
                  example: {
                    success: true,
                    message: 'User deleted',
                    data: { id: '665f1a2b3c4d5e6f7a8b9c0d' },
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            404: { $ref: '#/components/responses/NotFound' },
          },
        },
      },
    },
  },
  apis: [], // all paths defined inline above
};

export const swaggerSpec = swaggerJsdoc(options);
