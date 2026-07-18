const axios = require('axios')

module.exports = {

  // List user's calendars
  async listCalendars(accessToken) {
    const res = await axios.get(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    return (res.data.items || [])
      .filter(c => c.accessRole === 'owner' || c.accessRole === 'writer')
      .map(c => ({
        id: c.id,
        title: c.summary,
        primary: c.primary || false
      }))
  },

  // Create a calendar event
  async createEvent({
    calendarId = 'primary',
    summary,
    description,
    location,
    startDateTime,
    endDateTime,
    startDate,
    endDate,
    timezone = 'UTC',
    attendees = [],
    accessToken
  }) {
    const event = { summary, description, location }

    // Use dateTime for timed events, date for all-day events
    if (startDateTime) {
      event.start = { dateTime: startDateTime, timeZone: timezone }
      event.end = { dateTime: endDateTime || startDateTime, timeZone: timezone }
    } else {
      event.start = { date: startDate }
      event.end = { date: endDate || startDate }
    }

    if (attendees.length > 0) {
      event.attendees = attendees.map(email => ({ email }))
    }

    const res = await axios.post(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      event,
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    )
    return res.data
  }
}
