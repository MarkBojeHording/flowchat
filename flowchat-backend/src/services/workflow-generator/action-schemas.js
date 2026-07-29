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
    jsonBody: (channelId) =>
      `={{ JSON.stringify({ channel: "${channelId}", text: ${fieldRefs.message} }) }}`,
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

module.exports = {
  gmail,
  slack,
  // Primary key used by build_workflow; "contacts" is the accepted alias
  google_contacts,
  contacts: google_contacts,
}
