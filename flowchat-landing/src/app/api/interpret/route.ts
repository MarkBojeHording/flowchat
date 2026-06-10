import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are an automation builder. The user will describe an automation they want in plain English.

Parse their request and return ONLY a valid JSON object with this structure:
{
  "trigger": {
    "app": "typeform|gmail|google_sheets|slack|airtable|webhook",
    "event": "form_response|new_email|new_row|new_message|new_record",
    "description": "plain English description of the trigger"
  },
  "actions": [
    {
      "app": "gmail|google_sheets|slack|airtable|notion",
      "event": "send_email|append_row|send_message|create_record",
      "description": "plain English description of this action"
    }
  ],
  "name": "short automation name",
  "description": "one sentence describing what this automation does"
}

Only include apps from this list: typeform, gmail, google_sheets, slack, airtable, notion.
Return ONLY the JSON object, nothing else.`

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json()

    if (!message) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 })
    }

    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: message }]
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonText = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()
    const json = JSON.parse(jsonText)
    return NextResponse.json(json)

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Interpret error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
