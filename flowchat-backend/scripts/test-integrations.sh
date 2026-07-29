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

# Test 1: Sheets -> Gmail
run_test "google_sheets" "gmail" \
  '{"to":"markhording@gmail.com","subject":"Test Sheet Row"}' \
  '{"column_headers":["Name","Email"],"column_values":["Test Person","test@example.com"]}'

# Test 2: Sheets -> Slack
run_test "google_sheets" "slack" \
  '{"channel_id":"#general"}' \
  '{"column_headers":["Name","Email"],"column_values":["Test Person","test@example.com"]}'

# Test 3: Gmail -> Slack
run_test "gmail" "slack" \
  '{"channel_id":"#general"}' \
  '{"column_values":["sender@example.com","John Sender","Test Subject","Test preview text"]}'

# Test 4: Sheets -> Contacts
run_test "google_sheets" "google_contacts" \
  '{}' \
  '{"column_headers":["Name","Email"],"column_values":["Jane Contact","jane@example.com"]}'

echo ""
echo "===================================="
echo "SUMMARY"
echo "===================================="
for r in "${RESULTS[@]}"; do
  echo "$r"
done
echo ""
echo "Passed: $PASS / $((PASS+FAIL))"
