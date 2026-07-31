// Special cases override the generic field-mapper approach
// entirely, providing a full custom codeNodeBody when a
// trigger/action pair needs logic beyond simple field mapping.

module.exports = {
  'typeform->notion': {
    buildCodeNode: (details) => {
      const fieldMapping = details.field_mapping || details.fieldMapping || []
      const notionFieldsJs = fieldMapping
        .map((f) => {
          const fieldId = f.typeform_id || f.id
          const fieldRef = `answersMap[${JSON.stringify(String(fieldId || ''))}]`
          const notionField = f.notion_field || f.notionColumn || f.name
          const notionType = f.notion_type || f.notionType || 'rich_text'
          if (notionType === 'title') {
            return `${JSON.stringify(notionField)}: { title: [{ text: { content: String(extractAnswer(${fieldRef}) || '') } }] }`
          }
          return `${JSON.stringify(notionField)}: { rich_text: [{ text: { content: String(extractAnswer(${fieldRef}) || '') } }] }`
        })
        .join(',\n    ')

      return `
function extractAnswer(answer) {
  if (!answer) return '';
  switch (answer.type) {
    case 'text': return answer.text || '';
    case 'email': return answer.email || '';
    case 'phone_number': return answer.phone_number || '';
    case 'number': return answer.number != null ? answer.number.toString() : '';
    case 'boolean': return answer.boolean === true ? 'Yes' : answer.boolean === false ? 'No' : '';
    case 'choice': return answer.choice?.label || '';
    case 'choices': return answer.choices?.labels?.join(', ') || '';
    default: return answer.text || answer.email || answer.phone_number || '';
  }
}
const body = $input.first().json.body || $input.first().json;
const answersMap = body.answers_map || {};
const payload = {
  parent: { database_id: ${JSON.stringify(details.database_id || details.databaseId || '')} },
  properties: {
    ${notionFieldsJs}
  }
};
return [{ json: payload }];
      `.trim()
    },
    apiConfig: {
      method: 'POST',
      url: 'https://api.notion.com/v1/pages',
      credentialPlatform: 'notion',
      extraHeaders: [{ name: 'Notion-Version', value: '2022-06-28' }],
    },
  },

  'typeform->google_contacts': {
    buildCodeNode: (details) => {
      const nameFieldId = details.name_field_id || ''
      const emailFieldId = details.email_field_id || ''
      return `
const body = $input.first().json.body || $input.first().json;
const answersMap = body.answers_map || {};
const nameAnswer = answersMap[${JSON.stringify(String(nameFieldId))}];
const emailAnswer = answersMap[${JSON.stringify(String(emailFieldId))}];
const name = (nameAnswer?.text) || body.submitter_name || 'Unknown';
const email = (emailAnswer?.email) || body.submitter_email || '';
const nameParts = String(name).split(' ');
const payload = {
  names: [{ givenName: nameParts[0] || '', familyName: nameParts.slice(1).join(' ') || '' }],
  emailAddresses: email ? [{ value: email }] : []
};
return [{ json: payload }];
      `.trim()
    },
    apiConfig: {
      method: 'POST',
      url: 'https://people.googleapis.com/v1/people:createContact',
      credentialPlatform: 'google',
    },
  },

  // Calendly normalize already produces column_values — no answers_map extraction
  'calendly->notion': {
    buildCodeNode: (details) => {
      const fieldMapping = details.field_mapping || details.fieldMapping || []
      const notionFieldsJs = fieldMapping
        .map((f, i) => {
          const notionField = f.notion_field || f.notionColumn || f.name
          const notionType = f.notion_type || f.notionType || 'rich_text'
          const valueRef = `(body.column_values || [])[${i}]`
          if (notionType === 'title') {
            return `${JSON.stringify(notionField)}: { title: [{ text: { content: String(${valueRef} || '') } }] }`
          }
          return `${JSON.stringify(notionField)}: { rich_text: [{ text: { content: String(${valueRef} || '') } }] }`
        })
        .join(',\n    ')

      return `
const body = $input.first().json.body || $input.first().json;
const payload = {
  parent: { database_id: ${JSON.stringify(details.database_id || details.databaseId || '')} },
  properties: {
    ${notionFieldsJs}
  }
};
return [{ json: payload }];
      `.trim()
    },
    apiConfig: {
      method: 'POST',
      url: 'https://api.notion.com/v1/pages',
      credentialPlatform: 'notion',
      extraHeaders: [{ name: 'Notion-Version', value: '2022-06-28' }],
    },
  },
}

// Alias accepted by build_workflow
module.exports['typeform->contacts'] = module.exports['typeform->google_contacts']
