'use strict'

const INTEGRATIONS = {

  schedule: {
    name: 'Schedule',
    category: 'time',
    auth_type: 'none',
    roles: ['trigger'],
    as_trigger: {
      requires: ['cron_expression'],
      questions: {
        frequency: 'How often should this run? (e.g. every day, every Monday, every Friday)',
        time: 'What time? (e.g. 9am, 4pm)',
      },
      setup_steps: [],
      parse_schedule: true,
    }
  },

  typeform: {
    name: 'Typeform',
    category: 'forms',
    auth_type: 'oauth',
    roles: ['trigger'],
    as_trigger: {
      requires: ['form_name'],
      questions: {
        form_name: 'Which Typeform should trigger this automation?',
      },
      setup_steps: ['Connect your Typeform account'],
    }
  },

  stripe: {
    name: 'Stripe',
    category: 'payments',
    auth_type: 'oauth',
    roles: ['trigger'],
    as_trigger: {
      requires: ['event'],
      questions: {
        event: 'What should trigger this — a new payment, new subscription, or a refund?',
      },
      setup_steps: ['Connect your Stripe account'],
      events: {
        payment: 'payment_intent.succeeded',
        subscription: 'customer.subscription.created',
        refund: 'charge.refunded',
      }
    }
  },

  calendly: {
    name: 'Calendly',
    category: 'scheduling',
    auth_type: 'oauth',
    roles: ['trigger'],
    as_trigger: {
      requires: ['event'],
      questions: {
        event: 'Should this trigger when someone books a meeting, cancels, or both?',
      },
      setup_steps: ['Connect your Calendly account'],
      events: {
        booked: 'invitee.created',
        canceled: 'invitee.canceled',
      }
    }
  },

  google_sheets: {
    name: 'Google Sheets',
    category: 'productivity',
    auth_type: 'oauth',
    roles: ['trigger', 'action'],
    as_trigger: {
      requires: ['spreadsheet', 'sheet_name'],
      questions: {
        spreadsheet: 'Which Google Sheet should trigger this?',
        sheet_name: 'Which tab should I watch for new rows?',
      },
      setup_steps: ['Connect your Google account'],
    },
    as_action: {
      requires: ['spreadsheet', 'sheet_name'],
      questions: {
        spreadsheet: 'Which Google Sheet should I add data to?',
        sheet_name: 'Which tab within that sheet?',
      },
      setup_steps: ['Connect your Google account'],
      common_errors: {
        not_found: 'The spreadsheet may have been deleted or moved',
        permission_denied: 'Make sure the sheet is accessible with your connected Google account',
      }
    }
  },

  gmail: {
    name: 'Gmail',
    category: 'email',
    auth_type: 'oauth',
    roles: ['trigger', 'action'],
    as_trigger: {
      requires: ['filter'],
      questions: {
        filter: 'What emails should trigger this? (e.g. from a specific sender, with a specific subject)',
      },
      setup_steps: ['Connect your Google account'],
    },
    as_action: {
      requires: ['to', 'subject', 'body'],
      questions: {
        to: 'What email address should I send to?',
        subject: 'What should the subject line be?',
        body: 'What should the email say?',
      },
      setup_steps: ['Connect your Google account'],
      common_errors: {
        invalid_grant: 'Your Google connection expired — reconnect to fix this',
        quota_exceeded: 'Gmail daily sending limit reached — try again tomorrow',
      }
    }
  },

  slack: {
    name: 'Slack',
    category: 'messaging',
    auth_type: 'oauth',
    roles: ['action'],
    as_action: {
      requires: ['channel', 'message'],
      questions: {
        channel: 'Which Slack channel should I send to?',
        message: 'What message should I send?',
      },
      setup_steps: [
        'Connect your Slack workspace',
        'Invite @Flowchat to the channel by running /invite @Flowchat in that channel',
      ],
      common_errors: {
        not_in_channel: 'Run /invite @Flowchat in your Slack channel then try again',
        channel_not_found: 'Check the channel name is spelled correctly',
        token_revoked: 'Your Slack connection was revoked — reconnect Slack to fix this',
      }
    }
  },

  airtable: {
    name: 'Airtable',
    category: 'database',
    auth_type: 'oauth',
    roles: ['trigger', 'action'],
    as_trigger: {
      requires: ['base', 'table'],
      questions: {
        base: 'Which Airtable base should trigger this?',
        table: 'Which table within that base should I watch?',
      },
      setup_steps: ['Connect your Airtable account'],
    },
    as_action: {
      requires: ['base', 'table'],
      questions: {
        base: 'Which Airtable base should I add records to?',
        table: 'Which table within that base?',
      },
      setup_steps: ['Connect your Airtable account'],
      common_errors: {
        not_found: 'The Airtable base or table may have been renamed or deleted',
        permission_denied: 'Make sure your Airtable account has access to this base',
      }
    }
  },

  notion: {
    name: 'Notion',
    category: 'productivity',
    auth_type: 'oauth',
    roles: ['action'],
    as_action: {
      requires: ['database'],
      questions: {
        database: 'Which Notion database should I add pages to?',
      },
      setup_steps: [
        'Connect your Notion account',
        'Add the Flowchat integration to the database in Notion settings',
      ],
      common_errors: {
        not_found: 'Make sure the Flowchat integration has been added to this Notion database',
        permission_denied: 'Open the database in Notion, click the three dots, and add the Flowchat integration',
      }
    }
  }

}

// ─── HELPER FUNCTIONS ─────────────────────────────────────────

function getIntegration(appName, role) {
  const integration = INTEGRATIONS[appName?.toLowerCase()]
  if (!integration) return null
  if (role && !integration.roles.includes(role)) return null
  return integration
}

function getTriggerApps() {
  return Object.entries(INTEGRATIONS)
    .filter(([, v]) => v.roles.includes('trigger'))
    .map(([k, v]) => ({ id: k, name: v.name, category: v.category }))
}

function getActionApps() {
  return Object.entries(INTEGRATIONS)
    .filter(([, v]) => v.roles.includes('action'))
    .map(([k, v]) => ({ id: k, name: v.name, category: v.category }))
}

function getRequiredFields(appName, role) {
  const integration = getIntegration(appName, role)
  if (!integration) return []
  const config = role === 'trigger' ? integration.as_trigger : integration.as_action
  return config?.requires || []
}

function getSetupSteps(appName, role) {
  const integration = getIntegration(appName, role)
  if (!integration) return []
  const config = role === 'trigger' ? integration.as_trigger : integration.as_action
  return config?.setup_steps || []
}

function getErrorMessage(appName, errorCode) {
  const integration = getIntegration(appName)
  if (!integration) return null
  const errors =
    integration.as_action?.common_errors ||
    integration.as_trigger?.common_errors ||
    {}
  return errors[errorCode] || null
}

function getMetadataForAgent(apps) {
  const appsToInclude = apps?.length ? apps : Object.keys(INTEGRATIONS)

  return appsToInclude
    .map(appName => {
      const integration = INTEGRATIONS[appName?.toLowerCase()]
      if (!integration) return null

      const lines = [`## ${integration.name}`]

      if (integration.as_trigger) {
        const t = integration.as_trigger
        lines.push(`As trigger:`)
        lines.push(`  Required fields: ${t.requires.join(', ')}`)
        if (t.setup_steps?.length) {
          lines.push(`  Setup: ${t.setup_steps.join(' | ')}`)
        }
        Object.entries(t.questions || {}).forEach(([field, q]) => {
          lines.push(`  Ask for ${field}: "${q}"`)
        })
      }

      if (integration.as_action) {
        const a = integration.as_action
        lines.push(`As action:`)
        lines.push(`  Required fields: ${a.requires.join(', ')}`)
        if (a.setup_steps?.length) {
          lines.push(`  Setup: ${a.setup_steps.join(' | ')}`)
        }
        Object.entries(a.questions || {}).forEach(([field, q]) => {
          lines.push(`  Ask for ${field}: "${q}"`)
        })
        if (a.common_errors) {
          lines.push(`  Common errors:`)
          Object.entries(a.common_errors).forEach(([err, fix]) => {
            lines.push(`    ${err}: ${fix}`)
          })
        }
      }

      return lines.join('\n')
    })
    .filter(Boolean)
    .join('\n\n')
}

module.exports = {
  INTEGRATIONS,
  getIntegration,
  getTriggerApps,
  getActionApps,
  getRequiredFields,
  getSetupSteps,
  getErrorMessage,
  getMetadataForAgent,
}
