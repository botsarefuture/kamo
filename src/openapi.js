export const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'Kamo API',
    version: '1.0.0',
    description:
      'Varastokaluston varausrajapinta. Jokainen organisaatio käyttää omaa API-avaintaan. ' +
      'Avain välitetään Authorization-otsakkeessa muodossa Bearer <avain>.',
  },
  servers: [{ url: '/api/v1', description: 'Nykyinen instanssi' }],
  security: [{ bearerAuth: [] }],
  paths: {
    '/me': {
      get: {
        summary: 'Organisaatio ja avaimen oikeudet',
        responses: { 200: { description: 'Organisaation tiedot' } },
      },
    },
    '/warehouses': {
      get: {
        summary: 'Varastot',
        responses: { 200: { description: 'Lista varastoista' } },
      },
    },
    '/items': {
      get: {
        summary: 'Nimikkeet ja saldot',
        responses: { 200: { description: 'Lista nimikkeistä' } },
      },
    },
    '/availability': {
      get: {
        summary: 'Saatavuus aikavälille',
        parameters: [
          { name: 'warehouse_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'from', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
        ],
        responses: { 200: { description: 'Nimikekohtainen saatavuus' } },
      },
    },
    '/bookings': {
      get: {
        summary: 'Varaukset',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: { 200: { description: 'Lista varauksista' } },
      },
      post: {
        summary: 'Luo varaus',
        parameters: [
          {
            name: 'Idempotency-Key',
            in: 'header',
            required: false,
            schema: { type: 'string', maxLength: 200 },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['warehouse_id', 'starts_on', 'ends_on', 'contact_name', 'contact_email', 'items'],
                properties: {
                  warehouse_id: { type: 'string', format: 'uuid' },
                  starts_on: { type: 'string', format: 'date' },
                  ends_on: { type: 'string', format: 'date' },
                  contact_name: { type: 'string' },
                  contact_email: { type: 'string', format: 'email' },
                  contact_phone: { type: 'string' },
                  purpose: { type: 'string' },
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['item_id', 'quantity'],
                      properties: {
                        item_id: { type: 'string', format: 'uuid' },
                        quantity: { type: 'integer', minimum: 1 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Varaus luotu' },
          409: { description: 'Kalusto ei riitä valitulle aikavälille' },
        },
      },
    },
    '/bookings/{reference}': {
      get: {
        summary: 'Yksi varaus',
        parameters: [
          { name: 'reference', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Varaus' }, 404: { description: 'Ei löytynyt' } },
      },
    },
    '/bookings/{reference}/status': {
      patch: {
        summary: 'Vaihda varauksen tila',
        parameters: [
          { name: 'reference', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: { type: 'string', enum: ['approved', 'rejected', 'cancelled', 'returned'] },
                  note: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Päivitetty varaus' } },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer' },
    },
  },
};
