const actionSchemas = require('./action-schemas')
const fieldMappers = require('./field-mappers')
const specialCases = require('./special-cases')

function buildSpecialCaseWorkflow({
  userId,
  triggerApp,
  actionApp,
  details,
  workflowName,
  specialCase,
}) {
  const backendUrl = (
    process.env.BACKEND_URL || 'https://flowchat-production-376f.up.railway.app'
  ).replace(/\/$/, '')
  const internalApiKey = process.env.INTERNAL_API_KEY || ''

  const webhookPath = `flowchat-${triggerApp}-${userId}-${Date.now()}`
  const testWebhookPath = `flowchat-test-${userId}-${Date.now() + 1}`

  const nodes = [
    {
      id: 'trigger-webhook',
      name: 'Trigger Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [256, 200],
      parameters: {
        httpMethod: 'POST',
        path: webhookPath,
        responseMode: 'responseNode',
        options: {},
      },
    },
    {
      id: 'test-webhook',
      name: 'Test Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [256, 400],
      parameters: {
        httpMethod: 'POST',
        path: testWebhookPath,
        responseMode: 'responseNode',
        options: {},
      },
    },
    {
      id: 'fetch-creds',
      name: 'Fetch Credentials',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [512, 304],
      parameters: {
        url: `${backendUrl}/api/auth/credentials/${userId}/${specialCase.apiConfig.credentialPlatform}`,
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'x-api-key', value: internalApiKey }],
        },
        options: {},
      },
    },
    {
      id: 'build-payload',
      name: 'Build Payload',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [768, 304],
      parameters: { jsCode: specialCase.buildCodeNode(details) },
    },
    {
      id: 'action-call',
      name: 'Action Call',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1024, 304],
      parameters: {
        method: specialCase.apiConfig.method,
        url: specialCase.apiConfig.url,
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: 'Authorization',
              value: "=Bearer {{ $('Fetch Credentials').item.json.access_token }}",
            },
            ...(specialCase.apiConfig.extraHeaders || []),
          ],
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ JSON.stringify($json) }}',
        options: {},
      },
    },
    {
      id: 'notify-success',
      name: 'Notify Flowchat',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1280, 304],
      parameters: {
        method: 'POST',
        url: `${backendUrl}/api/executions/log`,
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'x-api-key', value: internalApiKey }],
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({ userId: "${userId}", n8nWorkflowId: $workflow.id, status: "success", mode: $execution.mode, details: { type: "${triggerApp}_to_${actionApp}" } }) }}`,
        options: {},
      },
    },
    {
      id: 'respond',
      name: 'Respond to Webhook',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [1536, 304],
      parameters: {
        respondWith: 'json',
        responseBody: '={{ JSON.stringify({ success: true }) }}',
        options: {},
      },
    },
  ]

  const connections = {
    'Trigger Webhook': {
      main: [[{ node: 'Fetch Credentials', type: 'main', index: 0 }]],
    },
    'Test Webhook': {
      main: [[{ node: 'Fetch Credentials', type: 'main', index: 0 }]],
    },
    'Fetch Credentials': {
      main: [[{ node: 'Build Payload', type: 'main', index: 0 }]],
    },
    'Build Payload': {
      main: [[{ node: 'Action Call', type: 'main', index: 0 }]],
    },
    'Action Call': {
      main: [[{ node: 'Notify Flowchat', type: 'main', index: 0 }]],
    },
    'Notify Flowchat': {
      main: [[{ node: 'Respond to Webhook', type: 'main', index: 0 }]],
    },
  }

  return {
    workflow: {
      name: workflowName,
      nodes,
      connections,
      settings: { executionOrder: 'v1', errorWorkflow: 'QhkpkeGqlspl7xXY' },
    },
    testWebhookPath,
  }
}

function buildGenericWorkflow({
  userId,
  triggerApp,
  actionApp,
  details,
  workflowName,
}) {
  const pairKey = `${triggerApp}->${actionApp}`
  const specialCase = specialCases[pairKey]

  if (specialCase) {
    return buildSpecialCaseWorkflow({
      userId,
      triggerApp,
      actionApp,
      details,
      workflowName,
      specialCase,
    })
  }

  const mapperKey = pairKey
  const mapper = fieldMappers[mapperKey]
  const actionSchema = actionSchemas[actionApp]

  if (!mapper || !actionSchema) {
    return null
  }

  const backendUrl = (
    process.env.BACKEND_URL || 'https://flowchat-production-376f.up.railway.app'
  ).replace(/\/$/, '')
  const internalApiKey = process.env.INTERNAL_API_KEY || ''

  const webhookPath = `flowchat-${triggerApp}-${userId}-${Date.now()}`
  const testWebhookPath = `flowchat-test-${userId}-${Date.now() + 1}`

  const fieldRefs = {}
  for (const field of actionSchema.requiredFields) {
    fieldRefs[field] = mapper[field] ? mapper[field](details) : "''"
  }

  const actionConfig = actionSchema.buildNode(fieldRefs)

  const nodes = [
    {
      id: 'trigger-webhook',
      name: 'Trigger Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [256, 200],
      parameters: {
        httpMethod: 'POST',
        path: webhookPath,
        responseMode: 'responseNode',
        options: {},
      },
    },
    {
      id: 'test-webhook',
      name: 'Test Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [256, 400],
      parameters: {
        httpMethod: 'POST',
        path: testWebhookPath,
        responseMode: 'responseNode',
        options: {},
      },
    },
    {
      id: 'fetch-creds',
      name: 'Fetch Credentials',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [512, 304],
      parameters: {
        url: `${backendUrl}/api/auth/credentials/${userId}/${actionConfig.credentialPlatform}`,
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'x-api-key', value: internalApiKey }],
        },
        options: {},
      },
    },
  ]

  if (actionConfig.isCodeNode) {
    nodes.push({
      id: 'build-payload',
      name: 'Build Payload',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [768, 304],
      parameters: { jsCode: actionConfig.codeNodeBody },
    })
    nodes.push({
      id: 'action-call',
      name: 'Action Call',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1024, 304],
      parameters: {
        method: actionConfig.method,
        url: actionConfig.url,
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'Authorization', value: actionConfig.authHeader }],
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ JSON.stringify($json) }}',
        options: {},
      },
    })
  } else {
    nodes.push({
      id: 'action-call',
      name: 'Action Call',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [768, 304],
      parameters: {
        method: actionConfig.method,
        url: actionConfig.url,
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'Authorization', value: actionConfig.authHeader }],
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: actionConfig.jsonBody(
          details.channel_id || details.channel || details.slack_channel || ''
        ),
        options: {},
      },
    })
  }

  nodes.push({
    id: 'notify-success',
    name: 'Notify Flowchat',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [1280, 304],
    parameters: {
      method: 'POST',
      url: `${backendUrl}/api/executions/log`,
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: 'x-api-key', value: internalApiKey }],
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: `={{ JSON.stringify({ userId: "${userId}", n8nWorkflowId: $workflow.id, status: "success", mode: $execution.mode, details: { type: "${triggerApp}_to_${actionApp}" } }) }}`,
      options: {},
    },
  })

  nodes.push({
    id: 'respond',
    name: 'Respond to Webhook',
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1.1,
    position: [1536, 304],
    parameters: {
      respondWith: 'json',
      responseBody: '={{ JSON.stringify({ success: true }) }}',
      options: {},
    },
  })

  const connections = {}
  const chain = actionConfig.isCodeNode
    ? [
        'Trigger Webhook',
        'Fetch Credentials',
        'Build Payload',
        'Action Call',
        'Notify Flowchat',
        'Respond to Webhook',
      ]
    : [
        'Trigger Webhook',
        'Fetch Credentials',
        'Action Call',
        'Notify Flowchat',
        'Respond to Webhook',
      ]

  for (let i = 0; i < chain.length - 1; i++) {
    connections[chain[i]] = {
      main: [[{ node: chain[i + 1], type: 'main', index: 0 }]],
    }
  }
  connections['Test Webhook'] = {
    main: [[{ node: chain[1], type: 'main', index: 0 }]],
  }

  return {
    workflow: {
      name: workflowName,
      nodes,
      connections,
      settings: { executionOrder: 'v1', errorWorkflow: 'QhkpkeGqlspl7xXY' },
    },
    testWebhookPath,
  }
}

module.exports = { buildGenericWorkflow }
