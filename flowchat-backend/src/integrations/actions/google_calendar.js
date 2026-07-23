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
    addMeetLink = true,
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

    if (addMeetLink) {
      event.conferenceData = {
        createRequest: {
          requestId: `flowchat-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      }
    }

    const res = await axios.post(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1`,
      event,
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    )
    return res.data
  },

  async updateEvent({
    calendarId = 'primary',
    eventId,
    summary,
    description,
    startDateTime,
    endDateTime,
    timezone = 'UTC',
    accessToken
  }) {
    const updates = {}
    if (summary) updates.summary = summary
    if (description) updates.description = description
    if (startDateTime) {
      updates.start = { dateTime: startDateTime, timeZone: timezone }
      updates.end = { dateTime: endDateTime || startDateTime, timeZone: timezone }
    }
    const res = await axios.patch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
      updates,
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    )
    return res.data
  },

  async listEvents({
    calendarId = 'primary',
    maxResults = 10,
    timeMin,
    timeMax,
    accessToken
  }) {
    const res = await axios.get(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        params: {
          maxResults,
          orderBy: 'startTime',
          singleEvents: true,
          timeMin: timeMin || new Date().toISOString(),
          timeMax
        },
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    )
    return res.data.items || []
  },

  async deleteEvent({ calendarId = 'primary', eventId, accessToken }) {
    await axios.delete(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
  },
}
