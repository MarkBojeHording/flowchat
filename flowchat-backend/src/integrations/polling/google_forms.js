const axios = require('axios')

module.exports = {
  // List user's Google Forms (via Drive API)
  async listForms(accessToken) {
    const res = await axios.get(
      "https://www.googleapis.com/drive/v3/files",
      {
        params: {
          q: "mimeType='application/vnd.google-apps.form' and trashed=false",
          fields: 'files(id,name)',
          pageSize: 20
        },
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    )
    return (res.data.files || []).map(f => ({
      id: f.id,
      title: f.name,
      type: 'form'
    }))
  },

  // Check for new responses since last timestamp
  async checkNewResponses({ formId, lastTimestamp, accessToken }) {
    const params = { pageSize: 10 }
    if (lastTimestamp) {
      params.filter = `timestamp > ${lastTimestamp}`
    }

    const res = await axios.get(
      `https://forms.googleapis.com/v1/forms/${formId}/responses`,
      {
        params,
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    )

    const responses = res.data.responses || []
    const newTimestamp = responses.length > 0
      ? responses[responses.length - 1].lastSubmittedTime
      : lastTimestamp

    return { newResponses: responses, newTimestamp }
  },

  // Get form questions for field mapping
  async getFormQuestions(formId, accessToken) {
    const res = await axios.get(
      `https://forms.googleapis.com/v1/forms/${formId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    return (res.data.items || [])
      .filter(item => item.questionItem)
      .map(item => ({
        id: item.questionItem.question.questionId,
        title: item.title,
        type: item.questionItem.question.textQuestion ? 'text' : 'choice'
      }))
  },

  // Normalize a Google Forms response
  normalize(response, questions = []) {
    const answers = response.answers || {}
    const columnValues = questions.map(q => {
      const answer = answers[q.id]
      if (!answer) return ''
      const textAnswers = answer.textAnswers?.answers || []
      return textAnswers.map(a => a.value).join(', ')
    })

    // Try to find email and name from answers
    const emailAnswer = Object.values(answers).find(a =>
      a.textAnswers?.answers?.[0]?.value?.includes('@')
    )
    const submitterEmail = response.respondentEmail || emailAnswer?.textAnswers?.answers?.[0]?.value || null

    return {
      submitted_at: response.lastSubmittedTime || new Date().toISOString(),
      submitter_email: submitterEmail,
      submitter_name: null,
      column_values: columnValues,
      column_headers: questions.map(q => q.title),
      raw: response
    }
  }
}
