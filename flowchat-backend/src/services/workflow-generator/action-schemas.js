// Each action declares: required fields, and how to build
// the n8n HTTP Request node body from those fields.
// fieldRefs are n8n expressions referencing the trigger payload.

const gmail = {
  requiredFields: ['to', 'subject', 'body'],
  buildNode: (fieldRefs) => ({
    method: 'POST',
    url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    authHeader: "=Bearer {{ $('Fetch Credentials').item.json.access_token }}",
    credentialPlatform: 'google',
    // Build the base64 raw email inside a Code node so
    // the encoding logic stays reusable and testable.
    codeNodeBody: `
const to = ${fieldRefs.to};
const subject = ${fieldRefs.subject};
const body = ${fieldRefs.body};
const raw = ['To: ' + to, 'Subject: ' + subject, 'Content-Type: text/plain; charset=utf-8', 'MIME-Version: 1.0', '', body].join('\\n');
const encoded = Buffer.from(raw).toString('base64').replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
return [{ json: { raw: encoded } }];
    `.trim(),
    isCodeNode: true,
  }),
}

const slack = {
  requiredFields: ['message'],
  buildNode: (fieldRefs) => ({
    method: 'POST',
    url: 'https://slack.com/api/chat.postMessage',
    authHeader: "=Bearer {{ $('Fetch Credentials').item.json.access_token }}",
    credentialPlatform: 'slack',
    isCodeNode: false,
    jsonBody: (details) =>
      `={{ JSON.stringify({ channel: ${JSON.stringify(
        details.channel_id || details.channel || details.slack_channel || ''
      )}, text: $('Build Payload').item.json.message }) }}`,
  }),
}

const google_contacts = {
  requiredFields: ['name', 'email'],
  buildNode: (fieldRefs) => ({
    method: 'POST',
    url: 'https://people.googleapis.com/v1/people:createContact',
    authHeader: "=Bearer {{ $('Fetch Credentials').item.json.access_token }}",
    credentialPlatform: 'google',
    isCodeNode: true,
    codeNodeBody: `
const name = ${fieldRefs.name};
const email = ${fieldRefs.email};
const nameParts = String(name).split(' ');
const payload = {
  names: [{ givenName: nameParts[0] || '', familyName: nameParts.slice(1).join(' ') || '' }],
  emailAddresses: email ? [{ value: email }] : []
};
return [{ json: payload }];
    `.trim(),
  }),
}

// Append one row. URL is per-sheet via urlBuilder(details) in node-builder.
// fieldRefs.values is a JS array expression evaluated in Build Payload;
// Action Call wraps it as { values: [row] } matching hardcoded templates.
const google_sheets = {
  requiredFields: ['values'],
  urlBuilder: (details) => {
    const sheetId = details.sheet_id || details.sheetId
    const sheetTab = details.sheet_tab || details.sheetTab || 'Sheet1'
    return `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetTab)}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`
  },
  buildNode: (fieldRefs) => ({
    method: 'POST',
    credentialPlatform: 'google',
    authHeader: "=Bearer {{ $('Fetch Credentials').item.json.access_token }}",
    isCodeNode: false,
    // values already computed in Build Payload — do not interpolate $json here
    jsonBody: () =>
      "={{ JSON.stringify({ values: [$('Build Payload').item.json.values] }) }}",
  }),
}

module.exports = {
  gmail,
  slack,
  google_sheets,
  sheets: google_sheets,
  // Primary key used by build_workflow; "contacts" is the accepted alias
  google_contacts,
  contacts: google_contacts,
}
