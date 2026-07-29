// Declares how to fill each action's required fields from
// a given trigger's normalized output. "columns" means
// auto-build a formatted string from column_headers/column_values.
//
// These expressions evaluate in the Build Payload Code node, which
// runs immediately after "Normalize Trigger Data", so bare $json
// is the unwrapped trigger payload (not Fetch Credentials output).

const GENERIC_COLUMN_SUMMARY =
  "(($json.body?.column_headers || $json.column_headers || []).map((h, i) => h + ': ' + (($json.body?.column_values || $json.column_values || [])[i] || '')).join('\\n'))"

const sheetsToContacts = {
  name: () =>
    "(() => { const headers = $json.body?.column_headers || $json.column_headers || []; " +
    "const values = $json.body?.column_values || $json.column_values || []; " +
    "const idx = headers.findIndex(h => /name/i.test(String(h||''))); " +
    "return idx >= 0 ? values[idx] : ($json.body?.submitter_name || $json.submitter_name || 'Unknown'); })()",
  email: () =>
    "(() => { const headers = $json.body?.column_headers || $json.column_headers || []; " +
    "const values = $json.body?.column_values || $json.column_values || []; " +
    "const idx = headers.findIndex(h => /email/i.test(String(h||''))); " +
    "return idx >= 0 ? values[idx] : ($json.body?.submitter_email || $json.submitter_email || ''); })()",
}

module.exports = {
  'google_sheets->gmail': {
    to: (details) =>
      details.to
        ? JSON.stringify(details.to)
        : "($json.body?.submitter_email || $json.submitter_email || '')",
    subject: (details) =>
      JSON.stringify(details.subject || 'New row added to your sheet'),
    body: (details) =>
      details.body_template
        ? `${JSON.stringify(details.body_template)} + "\\n\\n" + ${GENERIC_COLUMN_SUMMARY}`
        : GENERIC_COLUMN_SUMMARY,
  },

  'google_sheets->slack': {
    message: (details) =>
      details.message_template
        ? `${JSON.stringify(details.message_template)} + "\\n\\n" + ${GENERIC_COLUMN_SUMMARY}`
        : `'New row added:\\n' + ${GENERIC_COLUMN_SUMMARY}`,
  },

  // Gmail poller column_values: [fromEmail, fromName, subject, snippet]
  'gmail->slack': {
    message: () =>
      "'New email from ' + " +
      "(($json.body?.column_values || $json.column_values || [])[1] || 'someone') + " +
      "':\\n' + " +
      "(($json.body?.column_values || $json.column_values || [])[2] || '') + " +
      "'\\n' + " +
      "(($json.body?.column_values || $json.column_values || [])[3] || '')",
  },

  'google_sheets->google_contacts': sheetsToContacts,
  'google_sheets->contacts': sheetsToContacts,
  'sheets->google_contacts': sheetsToContacts,
  'sheets->contacts': sheetsToContacts,
}
