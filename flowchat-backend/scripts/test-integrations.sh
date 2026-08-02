#!/bin/bash
BACKEND="https://flowchat-production-376f.up.railway.app"
N8N="https://n8n.flowchat.now"
API_KEY="flowchat_internal_2026"
USER_ID="59866113-2add-4eb0-b183-8b66e9b686b0"

PASS=0
FAIL=0
RESULTS=()

run_test() {
  local trigger=$1
  local action=$2
  local details=$3
  local test_payload=$4
  local label="$trigger -> $action"

  echo ""
  echo "===================================="
  echo "Testing: $label"
  echo "===================================="

  # Build workflow
  BUILD_RESPONSE=$(curl -s -X POST "$BACKEND/api/chat/build_workflow_direct" \
    -H "x-api-key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"userId\":\"$USER_ID\",\"triggerApp\":\"$trigger\",\"actionApp\":\"$action\",\"details\":$details}")

  SUCCESS=$(echo "$BUILD_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('success', False))" 2>/dev/null)

  if [ "$SUCCESS" != "True" ]; then
    echo "❌ BUILD FAILED"
    echo "$BUILD_RESPONSE" | python3 -m json.tool 2>/dev/null | head -20
    RESULTS+=("❌ $label — build failed")
    FAIL=$((FAIL+1))
    return
  fi

  TEST_URL=$(echo "$BUILD_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('testWebhookUrl', ''))")
  WORKFLOW_ID=$(echo "$BUILD_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('n8nWorkflowId', ''))")

  echo "Workflow ID: $WORKFLOW_ID"
  echo "Test URL: $TEST_URL"

  # Trigger test webhook
  sleep 1
  TRIGGER_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" \
    -d "$test_payload" "$TEST_URL")

  echo "Trigger response: $TRIGGER_RESPONSE"

  # Wait for execution to complete
  sleep 3

  # Check execution status
  EXEC_CHECK=$(curl -s -H "x-api-key: $API_KEY" \
    "$BACKEND/api/n8n/executions?workflowId=$WORKFLOW_ID&limit=1")

  EXEC_STATUS=$(echo "$EXEC_CHECK" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    results = data.get('data', data) if isinstance(data, dict) else data
    if isinstance(results, list) and len(results) > 0:
        print(results[0].get('status', results[0].get('finished', 'unknown')))
    elif isinstance(results, dict) and 'data' in results:
        print(results['data'][0].get('status', 'unknown'))
    else:
        print('unknown')
except Exception as e:
    print(f'error: {e}')
" 2>/dev/null)

  echo "Execution status: $EXEC_STATUS"

  if [[ "$EXEC_STATUS" == *"success"* ]] || [[ "$EXEC_STATUS" == "True" ]]; then
    echo "✅ PASS"
    RESULTS+=("✅ $label")
    PASS=$((PASS+1))
  else
    echo "⚠️  UNCLEAR — check manually"
    RESULTS+=("⚠️  $label — status: $EXEC_STATUS")
    FAIL=$((FAIL+1))
  fi
}

echo "Starting integration test suite..."
echo "User: $USER_ID"

# Test: Typeform -> Google Sheets (core path)
run_test "typeform" "google_sheets" \
  '{"form_id":"HPExk4sV","sheet_id":"1G5Zx-0cuvlbyJ0R1_cHLHIEOOWp5-ZKoDXO4HwVJcZ8","sheet_tab":"Sheet1","field_mapping":[{"id":"61iCXR1UZZgI","title":"Full Name","type":"short_text"},{"id":"su7xFSJfwNKw","title":"Email Address","type":"email"}]}' \
  '{"form_response":{"form_id":"HPExk4sV","submitted_at":"2026-07-29T18:00:00Z","answers":[{"type":"text","field":{"id":"61iCXR1UZZgI"},"text":"Test Beta User"},{"type":"email","field":{"id":"su7xFSJfwNKw"},"email":"betauser@example.com"}]}}'

# Test: Typeform -> Gmail (core path)
run_test "typeform" "gmail" \
  '{"form_id":"HPExk4sV","to":"markhording@gmail.com","subject":"New form submission"}' \
  '{"submitter_name":"Test Beta User","submitter_email":"betauser@example.com","submitted_at":"2026-07-29T18:00:00Z","form_id":"HPExk4sV"}'

# Test: Schedule -> Slack (core path)
run_test "schedule" "slack" \
  '{"channel_id":"#general","message":"Weekly reminder test","cron_expression":"0 9 * * 1"}' \
  '{}'

# Test: Schedule -> Gmail (core path)
run_test "schedule" "gmail" \
  '{"to":"markhording@gmail.com","subject":"Weekly reminder","body":"This is your scheduled reminder","cron_expression":"0 9 * * 1"}' \
  '{}'

# Test: Sheets -> Gmail (generator)
run_test "google_sheets" "gmail" \
  '{"to":"markhording@gmail.com","subject":"Test Sheet Row"}' \
  '{"column_headers":["Name","Email"],"column_values":["Test Person","test@example.com"]}'

# Test: Sheets -> Slack (generator)
run_test "google_sheets" "slack" \
  '{"channel_id":"#general"}' \
  '{"column_headers":["Name","Email"],"column_values":["Test Person","test@example.com"]}'

# Test: Gmail -> Slack (generator)
run_test "gmail" "slack" \
  '{"channel_id":"#general"}' \
  '{"column_values":["sender@example.com","John Sender","Test Subject","Test preview text"]}'

# Test: Sheets -> Contacts (generator)
run_test "google_sheets" "google_contacts" \
  '{}' \
  '{"column_headers":["Name","Email"],"column_values":["Jane Contact","jane@example.com"]}'

# Test: Gmail -> Google Sheets (generator — sheets as action)
run_test "gmail" "google_sheets" \
  '{"sheet_id":"1G5Zx-0cuvlbyJ0R1_cHLHIEOOWp5-ZKoDXO4HwVJcZ8","sheet_tab":"Sheet1"}' \
  '{"column_values":["sender@example.com","John Sender","Test Subject","Test preview"]}'

# ─── CALENDLY ─────────────────────────────────────────────────
CALENDLY_PAYLOAD='{"payload":{"name":"Jane Client","email":"jane.client@example.com","created_at":"2026-07-31T18:00:00Z","scheduled_event":{"name":"30 Minute Meeting","start_time":"2026-08-01T10:00:00Z","end_time":"2026-08-01T10:30:00Z"},"questions_and_answers":[]}}'

run_test "calendly" "slack" \
  '{"channel_id":"#general"}' \
  "$CALENDLY_PAYLOAD"

run_test "calendly" "gmail" \
  '{"to":"markhording@gmail.com","subject":"New Calendly booking"}' \
  "$CALENDLY_PAYLOAD"

run_test "calendly" "google_contacts" \
  '{}' \
  "$CALENDLY_PAYLOAD"

run_test "calendly" "google_sheets" \
  '{"sheet_id":"1G5Zx-0cuvlbyJ0R1_cHLHIEOOWp5-ZKoDXO4HwVJcZ8","sheet_tab":"Sheet1"}' \
  "$CALENDLY_PAYLOAD"

# ─── GOOGLE CALENDAR / DRIVE / DOCS (hardcoded templates, built but not live-tested) ─
TYPEFORM_PAYLOAD='{"form_response":{"form_id":"HPExk4sV","submitted_at":"2026-08-02T12:00:00Z","answers":[{"type":"text","field":{"id":"61iCXR1UZZgI"},"text":"Test Beta User"},{"type":"email","field":{"id":"su7xFSJfwNKw"},"email":"betauser@example.com"}]}}'

run_test "typeform" "google_calendar" \
  '{"calendar_id":"primary","event_title_template":"Test event from {{submitter_name}}","duration_minutes":30}' \
  "$TYPEFORM_PAYLOAD"

run_test "typeform" "google_drive" \
  '{"folder_name":"Test Folder — {{submitter_name}}"}' \
  "$TYPEFORM_PAYLOAD"

run_test "typeform" "google_docs" \
  '{"doc_title":"Test Doc — Beta Submission"}' \
  "$TYPEFORM_PAYLOAD"

echo ""
echo "===================================="
echo "SUMMARY — CORE PATHS (must be 100% before beta)"
echo "===================================="
for i in 0 1 2 3; do
  echo "${RESULTS[$i]}"
done
echo ""
echo "===================================="
echo "SUMMARY — EXTENDED INTEGRATIONS"
echo "===================================="
for i in 4 5 6 7; do
  echo "${RESULTS[$i]}"
done
echo ""
echo "===================================="
echo "SUMMARY — GMAIL → GOOGLE SHEETS"
echo "===================================="
echo "${RESULTS[8]}"
echo ""
echo "===================================="
echo "SUMMARY — CALENDLY"
echo "===================================="
for i in 9 10 11 12; do
  echo "${RESULTS[$i]}"
done
echo ""
echo "===================================="
echo "SUMMARY — GOOGLE CALENDAR / DRIVE / DOCS"
echo "===================================="
for i in 13 14 15; do
  echo "${RESULTS[$i]}"
done
echo ""
echo "Total passed: $PASS / $((PASS+FAIL))"
