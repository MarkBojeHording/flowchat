const axios = require('axios')

module.exports = {
  // Check for events starting within the next X minutes
  async checkUpcomingEvents({
    calendarId = 'primary',
    minutesBefore = 60,
    processedEventIds = [],
    accessToken
  }) {
    const now = new Date()
    const future = new Date(now.getTime() + minutesBefore * 60 * 1000)

    const res = await axios.get(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        params: {
          timeMin: now.toISOString(),
          timeMax: future.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 10
        },
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    )

    const events = res.data.items || []

    // Filter out already-processed events
    const newEvents = events.filter(e => !processedEventIds.includes(e.id))

    return {
      newEvents,
      processedEventIds: [
        ...processedEventIds,
        ...newEvents.map(e => e.id)
      ].slice(-100) // Keep last 100 to prevent unbounded growth
    }
  },

  normalize(event) {
    const startTime = event.start?.dateTime || event.start?.date || ''
    const endTime = event.end?.dateTime || event.end?.date || ''
    const attendees = (event.attendees || []).map(a => a.email).join(', ')
    const meetLink = event.conferenceData?.entryPoints?.[0]?.uri || ''

    return {
      submitted_at: new Date().toISOString(),
      submitter_email: event.organizer?.email || null,
      submitter_name: event.organizer?.displayName || null,
      column_values: [
        event.summary || 'Untitled event',
        startTime,
        endTime,
        event.location || '',
        attendees,
        meetLink,
        event.description || ''
      ],
      column_headers: ['Title', 'Start Time', 'End Time', 'Location', 'Attendees', 'Meet Link', 'Description'],
      raw: event
    }
  }
}
