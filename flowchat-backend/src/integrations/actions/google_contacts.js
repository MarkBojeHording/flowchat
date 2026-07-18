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
}
