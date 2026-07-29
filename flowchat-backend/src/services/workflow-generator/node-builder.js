const actionSchemas = require('./action-schemas')
const fieldMappers = require('./field-mappers')
const specialCases = require('./special-cases')

function normalizeTriggerDataNode() {
  return {
    id: 'normalize-data',
    name: 'Normalize Trigger Data',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [384, 304],
    parameters: {
      jsCode:
        'const body = $input.first().json.body || $input.first().json; return [{ json: body }];',
    },
  }
}

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
    normalizeTriggerDataNode(),
    {
      id: 'build-payload',
      name: 'Build Payload',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [640, 304],
      parameters: { jsCode: specialCase.buildCodeNode(details) },
    },
    {
      id: 'fetch-creds',
      name: 'Fetch Credentials',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [896, 304],
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
      id: 'action-call',
      name: 'Action Call',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1152, 304],
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
        jsonBody: "={{ JSON.stringify($('Build Payload').item.json) }}",
        options: {},
      },
    },
    {
      id: 'notify-success',
      name: 'Notify Flowchat',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1408, 304],
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
      position: [1664, 304],
      parameters: {
        respondWith: 'json',
        responseBody: '={{ JSON.stringify({ success: true }) }}',
        options: {},
      },
    },
  ]

  const connections = {
    'Trigger Webhook': {
      main: [[{ node: 'Normalize Trigger Data', type: 'main', index: 0 }]],
    },
    'Test Webhook': {
      main: [[{ node: 'Normalize Trigger Data', type: 'main', index: 0 }]],
    },
    'Normalize Trigger Data': {
      main: [[{ node: 'Build Payload', type: 'main', index: 0 }]],
    },
    'Build Payload': {
      main: [[{ node: 'Fetch Credentials', type: 'main', index: 0 }]],
    },
    'Fetch Credentials': {
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

  // Build Payload must run immediately after Normalize Trigger Data so
  // field-mapper $json expressions resolve to the trigger payload, matching
  // the Set Submission Data pattern in the old hardcoded templates.
  const buildPayloadJsCode = actionConfig.isCodeNode
    ? actionConfig.codeNodeBody
    : [
        `const message = ${fieldRefs.message || "''"};`,
        'return [{ json: { message } }];',
      ].join('\n')

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
    normalizeTriggerDataNode(),
    {
      id: 'build-payload',
      name: 'Build Payload',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [640, 304],
      parameters: { jsCode: buildPayloadJsCode },
    },
    {
      id: 'fetch-creds',
      name: 'Fetch Credentials',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [896, 304],
      parameters: {
        url: `${backendUrl}/api/auth/credentials/${userId}/${actionConfig.credentialPlatform}`,
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'x-api-key', value: internalApiKey }],
        },
        options: {},
      },
    },
    {
      id: 'action-call',
      name: 'Action Call',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1152, 304],
      parameters: {
        method: actionConfig.method,
        url: actionConfig.url,
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'Authorization', value: actionConfig.authHeader },
          ],
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: actionConfig.isCodeNode
          ? "={{ JSON.stringify($('Build Payload').item.json) }}"
          : `={{ JSON.stringify({ channel: ${JSON.stringify(
              details.channel_id || details.channel || details.slack_channel || ''
            )}, text: $('Build Payload').item.json.message }) }}`,
        options: {},
      },
    },
    {
      id: 'notify-success',
      name: 'Notify Flowchat',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1408, 304],
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
      position: [1664, 304],
      parameters: {
        respondWith: 'json',
        responseBody: '={{ JSON.stringify({ success: true }) }}',
        options: {},
      },
    },
  ]

  const connections = {
    'Trigger Webhook': {
      main: [[{ node: 'Normalize Trigger Data', type: 'main', index: 0 }]],
    },
    'Test Webhook': {
      main: [[{ node: 'Normalize Trigger Data', type: 'main', index: 0 }]],
    },
    'Normalize Trigger Data': {
      main: [[{ node: 'Build Payload', type: 'main', index: 0 }]],
    },
    'Build Payload': {
      main: [[{ node: 'Fetch Credentials', type: 'main', index: 0 }]],
    },
    'Fetch Credentials': {
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

module.exports = { buildGenericWorkflow }
