module.exports = {
  typeform: {
    description: 'Typeform webhook payload',
    fields: {
      submitter_email: "{{ $json.form_response.answers.find(a => a.type === 'email')?.email }}",
      submitter_name: "{{ $json.form_response.answers.find(a => a.field.type === 'short_text')?.text }}",
      form_id: '{{ $json.form_response.form_id }}',
      submitted_at: '{{ $json.form_response.submitted_at }}',
      all_answers: '{{ JSON.stringify($json.form_response.answers) }}',
    },
    notes: 'Answers are in $json.form_response.answers array. Each answer has a field.ref and type-specific value property (text, email, number, choice.label etc).'
  },
  stripe: {
    description: 'Stripe webhook payload (payment_intent.succeeded)',
    fields: {
      amount: '{{ ($json.data.object.amount / 100).toFixed(2) }}',
      currency: '{{ $json.data.object.currency.toUpperCase() }}',
      customer_email: '{{ $json.data.object.receipt_email }}',
      customer_name: '{{ $json.data.object.shipping?.name }}',
      payment_id: '{{ $json.data.object.id }}',
      event_type: '{{ $json.type }}',
    },
    notes: 'Amount is in smallest currency unit (cents). Divide by 100 for display.'
  },
  calendly: {
    description: 'Calendly webhook payload (invitee.created)',
    fields: {
      invitee_name: '{{ $json.payload.invitee.name }}',
      invitee_email: '{{ $json.payload.invitee.email }}',
      event_name: '{{ $json.payload.event_type.name }}',
      start_time: '{{ $json.payload.event.start_time }}',
      cancel_url: '{{ $json.payload.invitee.cancel_url }}',
      reschedule_url: '{{ $json.payload.invitee.reschedule_url }}',
    },
    notes: 'Event details are under $json.payload.event, invitee details under $json.payload.invitee.'
  },
  gmail: {
    description: 'Gmail watch notification (new email trigger)',
    fields: {
      sender: '{{ $json.from }}',
      subject: '{{ $json.subject }}',
      body_snippet: '{{ $json.snippet }}',
      message_id: '{{ $json.id }}',
      received_at: '{{ $json.internalDate }}',
    },
    notes: 'Full body requires a separate Gmail messages.get API call using the message_id.'
  },
  google_sheets: {
    description: 'New row added to Google Sheets (via polling)',
    fields: {
      row_number: '{{ $json.row }}',
      all_columns: '{{ JSON.stringify($json) }}',
    },
    notes: 'Column values are available as $json.ColumnName where ColumnName matches the header row exactly.'
  }
}
