// Declares how to fill each action's required fields from
// a given trigger's normalized output. "columns" means
// auto-build a formatted string from column_headers/column_values.

const GENERIC_COLUMN_SUMMARY =
  "(($json.body?.column_headers || $json.column_headers || []).map((h, i) => h + ': ' + (($json.body?.column_values || $json.column_values || [])[i] || '')).join('\\n'))"

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
}
