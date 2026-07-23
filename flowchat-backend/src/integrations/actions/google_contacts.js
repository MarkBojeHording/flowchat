const axios = require('axios')

module.exports = {
  async createContact({
    givenName,
    familyName,
    email,
    phone,
    company,
    accessToken,
  }) {
    const person = {}

    if (givenName || familyName) {
      person.names = [{ givenName: givenName || '', familyName: familyName || '' }]
    }
    if (email) {
      person.emailAddresses = [{ value: email }]
    }
    if (phone) {
      person.phoneNumbers = [{ value: phone }]
    }
    if (company) {
      person.organizations = [{ name: company }]
    }

    const res = await axios.post(
      'https://people.googleapis.com/v1/people:createContact',
      person,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    )
    return res.data
  },

  async listContacts({ maxResults = 20, accessToken }) {
    const res = await axios.get(
      'https://people.googleapis.com/v1/people/me/connections',
      {
        params: {
          pageSize: maxResults,
          personFields: 'names,emailAddresses,phoneNumbers'
        },
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    )
    return (res.data.connections || []).map(p => ({
      id: p.resourceName,
      name: p.names?.[0]?.displayName || '',
      email: p.emailAddresses?.[0]?.value || '',
      phone: p.phoneNumbers?.[0]?.value || ''
    }))
  },

  async findContact({ email, accessToken }) {
    const contacts = await this.listContacts({ maxResults: 1000, accessToken })
    return contacts.find(c => c.email === email) || null
  },

  async updateContact({
    resourceName,
    givenName,
    familyName,
    email,
    phone,
    accessToken
  }) {
    // First get the current contact to get etag
    const getRes = await axios.get(
      `https://people.googleapis.com/v1/${resourceName}`,
      {
        params: { personFields: 'names,emailAddresses,phoneNumbers,metadata' },
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    )
    const person = getRes.data

    if (givenName || familyName) {
      person.names = [{
        givenName: givenName || person.names?.[0]?.givenName || '',
        familyName: familyName || person.names?.[0]?.familyName || ''
      }]
    }
    if (email) person.emailAddresses = [{ value: email }]
    if (phone) person.phoneNumbers = [{ value: phone }]

    const res = await axios.patch(
      `https://people.googleapis.com/v1/${resourceName}:updateContact`,
      person,
      {
        params: { updatePersonFields: 'names,emailAddresses,phoneNumbers' },
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
      }
    )
    return res.data
  }
}
