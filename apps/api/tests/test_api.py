import os
from pathlib import Path

os.environ["STORAGE_BACKEND"] = "memory"
os.environ["OPENAI_API_BASE"] = ""
os.environ["OPENAI_API_KEY"] = ""
os.environ["DEFAULT_LLM_MODEL"] = ""

from fastapi.testclient import TestClient
import jwt
import pytest

from app import store as store_module
from app.core.config import Settings
from app.main import create_app


def _test_settings(**overrides) -> Settings:
  values = {
    "MOCK_OTP_CODE": "654321",
    "STORAGE_BACKEND": "memory",
    "SMS_SEND_COOLDOWN": "0s",
    "SMS_ENABLED": True,
    "SMS_PROVIDER": "mock",
    "OPENAI_API_BASE": None,
    "OPENAI_API_KEY": None,
    "DEFAULT_LLM_MODEL": None,
  }
  values.update(overrides)
  return Settings(**values)


def test_minimal_case_workflow() -> None:
  client = TestClient(create_app(_test_settings()))
  headers = _register_client(client)
  case_id = _create_case(client, headers)

  upload = client.post(
    f"/api/v1/cases/{case_id}/evidence/contract",
    headers=headers,
    files={"file": ("contract.pdf", b"contract bytes", "application/pdf")},
  )
  assert upload.status_code == 200
  contract = next(item for item in upload.json()["case"]["evidence"] if item["id"] == "contract")
  assert contract["status"] == "recognized"
  assert contract["files"][0]["name"] == "contract.pdf"
  assert upload.json()["file"]["name"] == "contract.pdf"
  _upload_required_evidence(client, headers, case_id)

  evaluated = client.post(f"/api/v1/cases/{case_id}/evaluate", headers=headers)
  assert evaluated.status_code == 200
  assessment = evaluated.json()["case"]["assessment"]
  assert evaluated.json()["job"]["status"] == "completed"
  assert assessment["winRate"] >= 60
  assert assessment["plans"]

  with client.stream("GET", f"/api/v1/cases/{case_id}/events", headers=headers) as events:
    assert events.status_code == 200
    assert events.headers["content-type"].startswith("text/event-stream")
    event_body = "".join(events.iter_text())
  assert "event: case.updated" in event_body
  assert "event: evidence.updated" in event_body
  assert "event: assessment.progress" in event_body
  assert '"message":"AI评估已完成"' not in event_body
  assert '"title":"AI评估已完成"' in event_body

  selected = client.post(
    f"/api/v1/cases/{case_id}/plan",
    headers=headers,
    json={"planId": "lawyer-review"},
  )
  assert selected.status_code == 200
  assert selected.json()["case"]["selectedPlan"] == "lawyer-review"

  with client.stream("GET", f"/api/v1/cases/{case_id}/events", headers=headers) as updated_events:
    assert updated_events.status_code == 200
    updated_event_body = "".join(updated_events.iter_text())
  assert "event: plan.selected" in updated_event_body


def test_evaluate_requires_required_evidence() -> None:
  client = TestClient(create_app(_test_settings()))
  headers = _register_client(client)
  case_id = _create_case(client, headers)

  evaluated = client.post(f"/api/v1/cases/{case_id}/evaluate", headers=headers)

  assert evaluated.status_code == 409
  assert evaluated.json()["detail"] == "REQUIRED_EVIDENCE_MISSING"


def test_plan_selection_rejects_stale_assessment_with_missing_required_evidence() -> None:
  client = TestClient(create_app(_test_settings()))
  headers = _register_client(client)
  case_id = _create_case(client, headers)
  _upload_required_evidence(client, headers, case_id)
  assert client.post(f"/api/v1/cases/{case_id}/evaluate", headers=headers).status_code == 200

  law_case = client.app.state.store._cases[case_id]
  for category in law_case.evidence:
    if category.required:
      category.files.clear()
      category.status = "pending"

  selected = client.post(
    f"/api/v1/cases/{case_id}/plan",
    headers=headers,
    json={"planId": "lawyer-review"},
  )

  assert selected.status_code == 409
  assert selected.json()["detail"] == "REQUIRED_EVIDENCE_MISSING"


def test_plan_selection_is_idempotent_and_rejects_switching() -> None:
  client = TestClient(create_app(_test_settings()))
  client_headers = _register_client(client, phone="13800001234")
  lawyer_headers = _create_approved_lawyer(client)
  case_id = _create_case(client, client_headers)
  _upload_required_evidence(client, client_headers, case_id)
  assert client.post(f"/api/v1/cases/{case_id}/evaluate", headers=client_headers).status_code == 200

  selected = client.post(
    f"/api/v1/cases/{case_id}/plan",
    headers=client_headers,
    json={"planId": "lawyer-review"},
  )
  assert selected.status_code == 200

  first_tasks = client.get("/api/v1/lawyer/tasks", headers=lawyer_headers).json()["tasks"]
  first_messages = client.get("/api/v1/messages", headers=client_headers).json()["messages"]

  selected_again = client.post(
    f"/api/v1/cases/{case_id}/plan",
    headers=client_headers,
    json={"planId": "lawyer-review"},
  )
  assert selected_again.status_code == 200

  repeated_tasks = client.get("/api/v1/lawyer/tasks", headers=lawyer_headers).json()["tasks"]
  repeated_messages = client.get("/api/v1/messages", headers=client_headers).json()["messages"]
  assert len(repeated_tasks) == len(first_tasks) == 1
  assert len(repeated_messages) == len(first_messages)

  switched = client.post(
    f"/api/v1/cases/{case_id}/plan",
    headers=client_headers,
    json={"planId": "self-service"},
  )
  assert switched.status_code == 409
  assert switched.json()["detail"] == "INVALID_STATE"


def test_password_login_supports_registered_clients() -> None:
  client = TestClient(create_app(_test_settings()))
  _register_client(client, phone="13800001234", password="ClientPass123!")

  login_response = client.post(
    "/api/v1/auth/login/password",
    json={"phone": "13800001234", "password": "ClientPass123!"},
  )

  assert login_response.status_code == 200
  token = login_response.json()["token"]
  assert token.count(".") == 2
  payload = jwt.decode(token, options={"verify_signature": False})
  assert payload["sub"]
  headers = {"Authorization": f"Bearer {token}"}
  me_response = client.get("/api/v1/me", headers=headers)
  assert me_response.status_code == 200
  assert me_response.json()["user"]["phone"] == "13800001234"


def test_password_login_rejects_wrong_or_missing_password() -> None:
  client = TestClient(create_app(_test_settings()))
  _register_client(client, phone="13800001234", password="ClientPass123!")
  _register_client(client, phone="13800005555")

  wrong_password = client.post(
    "/api/v1/auth/login/password",
    json={"phone": "13800001234", "password": "wrong-password"},
  )
  missing_hash = client.post(
    "/api/v1/auth/login/password",
    json={"phone": "13800005555", "password": "ClientPass123!"},
  )

  assert wrong_password.status_code == 401
  assert wrong_password.json()["detail"] == "INVALID_CREDENTIALS"
  assert missing_hash.status_code == 401
  assert missing_hash.json()["detail"] == "INVALID_CREDENTIALS"


def test_password_login_rejects_disabled_users() -> None:
  client = TestClient(create_app(_test_settings()))
  headers = _register_client(client, phone="13800001234", password="ClientPass123!")
  user_id = client.get("/api/v1/me", headers=headers).json()["user"]["id"]
  client.app.state.store._users_by_id[user_id].accountStatus = "disabled"

  response = client.post(
    "/api/v1/auth/login/password",
    json={"phone": "13800001234", "password": "ClientPass123!"},
  )

  assert response.status_code == 403
  assert response.json()["detail"] == "ACCOUNT_DISABLED"


def test_admin_bootstrap_password_can_login_admin() -> None:
  settings = _test_settings(ADMIN_PHONE="13600000000", ADMIN_NAME="平台管理员", ADMIN_PASSWORD="AdminPass123!")
  client = TestClient(create_app(settings))

  response = client.post(
    "/api/v1/auth/login/password",
    json={"phone": settings.ADMIN_PHONE, "password": "AdminPass123!"},
  )

  assert response.status_code == 200
  assert response.json()["user"]["role"] == "admin"


def test_pending_lawyer_password_login_keeps_lawyer_api_locked() -> None:
  client = TestClient(create_app(_test_settings()))
  _onboard_lawyer(client, phone="13900008888", password="LawyerPass123!")

  response = client.post(
    "/api/v1/auth/login/password",
    json={"phone": "13900008888", "password": "LawyerPass123!"},
  )

  assert response.status_code == 200
  assert response.json()["user"]["role"] == "lawyer"
  assert response.json()["user"]["lawyerReviewStatus"] == "pending_review"
  lawyer_headers = {"Authorization": f"Bearer {response.json()['token']}"}
  tasks = client.get("/api/v1/lawyer/tasks", headers=lawyer_headers)
  assert tasks.status_code == 403
  assert tasks.json()["detail"] == "LAWYER_NOT_APPROVED"


def test_lawyer_review_document_closed_loop() -> None:
  client = TestClient(create_app(_test_settings()))
  client_headers = _register_client(client, phone="13800001234")
  lawyer_headers = _create_approved_lawyer(client)
  case_id = _create_case(client, client_headers)

  upload = client.post(
    f"/api/v1/cases/{case_id}/evidence/contract",
    headers=client_headers,
    files={"file": ("contract.pdf", b"contract bytes", "application/pdf")},
  )
  assert upload.status_code == 200
  _upload_required_evidence(client, client_headers, case_id)
  assert client.post(f"/api/v1/cases/{case_id}/evaluate", headers=client_headers).status_code == 200

  selected = client.post(
    f"/api/v1/cases/{case_id}/plan",
    headers=client_headers,
    json={"planId": "lawyer-review"},
  )
  assert selected.status_code == 200
  assert selected.json()["case"]["status"] == "律师复核中"

  user_messages = client.get("/api/v1/messages", headers=client_headers)
  assert user_messages.status_code == 200
  assert any("律师复核" in message["title"] for message in user_messages.json()["messages"])

  lawyer_tasks = client.get("/api/v1/lawyer/tasks", headers=lawyer_headers)
  assert lawyer_tasks.status_code == 200
  task = lawyer_tasks.json()["tasks"][0]
  assert task["caseId"] == case_id
  assert task["status"] == "pending"

  submitted_review = client.post(
    f"/api/v1/lawyer/tasks/{task['id']}/review",
    headers=lawyer_headers,
    json={
      "conclusion": "材料基本完整，可先发律师函催告。",
      "riskLevel": "medium",
      "evidenceGaps": ["补充最近一次催款聊天记录"],
      "advice": "建议先发送律师函，保留后续诉讼准备。",
      "nextAction": "draft_lawyer_letter",
    },
  )
  assert submitted_review.status_code == 200
  assert submitted_review.json()["workItem"]["status"] == "completed"
  assert submitted_review.json()["case"]["status"] == "待确认律师意见"

  created_document = client.post(
    f"/api/v1/lawyer/cases/{case_id}/documents",
    headers=lawyer_headers,
    json={
      "type": "lawyer_letter",
      "title": "催款律师函",
      "fields": {
        "recipient": "北京YY贸易有限公司",
        "request": "请于三日内支付欠款",
      },
      "body": "请贵司收到本函后三日内支付全部欠款。",
    },
  )
  assert created_document.status_code == 201
  document = created_document.json()["document"]
  assert document["status"] == "draft"

  lawyer_documents = client.get(
    f"/api/v1/lawyer/cases/{case_id}/documents",
    headers=lawyer_headers,
  )
  assert lawyer_documents.status_code == 200
  assert lawyer_documents.json()["documents"][0]["id"] == document["id"]

  client_draft_documents = client.get(
    f"/api/v1/cases/{case_id}/documents",
    headers=client_headers,
  )
  assert client_draft_documents.status_code == 200
  assert all(item["id"] != document["id"] for item in client_draft_documents.json()["documents"])

  premature_approval = client.post(
    f"/api/v1/cases/{case_id}/documents/{document['id']}/approve",
    headers=client_headers,
  )
  assert premature_approval.status_code == 409
  assert premature_approval.json()["detail"] == "INVALID_STATE"

  incomplete_document_submit = client.post(
    f"/api/v1/lawyer/cases/{case_id}/documents/{document['id']}/submit",
    headers=lawyer_headers,
  )
  assert incomplete_document_submit.status_code == 409
  assert incomplete_document_submit.json()["detail"] == "REQUIRED_DOCUMENT_FIELDS_MISSING"

  updated_document = client.patch(
    f"/api/v1/lawyer/cases/{case_id}/documents/{document['id']}",
    headers=lawyer_headers,
    json={
      "title": "正式催款律师函",
      "fields": {"deadline": "三日内"},
      "body": "请贵司收到本函后三日内支付全部欠款及逾期损失。",
    },
  )
  assert updated_document.status_code == 200
  assert updated_document.json()["document"]["version"] == 2

  submitted_document = client.post(
    f"/api/v1/lawyer/cases/{case_id}/documents/{document['id']}/submit",
    headers=lawyer_headers,
  )
  assert submitted_document.status_code == 200
  assert submitted_document.json()["document"]["status"] == "pending_client_approval"

  client_pending_documents = client.get(
    f"/api/v1/cases/{case_id}/documents",
    headers=client_headers,
  )
  assert client_pending_documents.status_code == 200
  assert client_pending_documents.json()["documents"][0]["id"] == document["id"]
  assert client_pending_documents.json()["documents"][0]["status"] == "pending_client_approval"

  resubmitted_pending_document = client.post(
    f"/api/v1/lawyer/cases/{case_id}/documents/{document['id']}/submit",
    headers=lawyer_headers,
  )
  assert resubmitted_pending_document.status_code == 409
  assert resubmitted_pending_document.json()["detail"] == "INVALID_STATE"

  updated_pending_document = client.patch(
    f"/api/v1/lawyer/cases/{case_id}/documents/{document['id']}",
    headers=lawyer_headers,
    json={"title": "pending document should stay immutable"},
  )
  assert updated_pending_document.status_code == 409
  assert updated_pending_document.json()["detail"] == "INVALID_STATE"

  approved_document = client.post(
    f"/api/v1/cases/{case_id}/documents/{document['id']}/approve",
    headers=client_headers,
  )
  assert approved_document.status_code == 200
  assert approved_document.json()["document"]["status"] == "approved"
  approved_case = approved_document.json()["case"]
  assert approved_case["status"] == "律师函已定稿，待客户自行发送"
  letter_stage = next(stage for stage in approved_case["stages"] if stage["key"] == "letter")
  negotiation_stage = next(stage for stage in approved_case["stages"] if stage["key"] == "negotiation")
  assert letter_stage["status"] == "active"
  assert letter_stage["description"] == "律师函已定稿，待客户下载或复制后自行发送"
  assert negotiation_stage["status"] == "todo"

  messages_after_approval = client.get("/api/v1/messages", headers=client_headers)
  assert messages_after_approval.status_code == 200
  assert any(
    message["title"] == "文书已确认" and "正式催款律师函" in message["body"] and document["id"] not in message["body"]
    for message in messages_after_approval.json()["messages"]
  )
  assert all("doc-" not in message["body"] for message in messages_after_approval.json()["messages"] if message["title"] == "文书已确认")

  updated_approved_document = client.patch(
    f"/api/v1/lawyer/cases/{case_id}/documents/{document['id']}",
    headers=lawyer_headers,
    json={"title": "approved document should stay immutable"},
  )
  assert updated_approved_document.status_code == 409
  assert updated_approved_document.json()["detail"] == "INVALID_STATE"

  resubmitted_approved_document = client.post(
    f"/api/v1/lawyer/cases/{case_id}/documents/{document['id']}/submit",
    headers=lawyer_headers,
  )
  assert resubmitted_approved_document.status_code == 409
  assert resubmitted_approved_document.json()["detail"] == "INVALID_STATE"

  archived_document = client.delete(
    f"/api/v1/lawyer/cases/{case_id}/documents/{document['id']}",
    headers=lawyer_headers,
  )
  assert archived_document.status_code == 409
  assert archived_document.json()["detail"] == "INVALID_STATE"


def test_full_service_send_proof_requires_lawyer_confirmation_before_response() -> None:
  client = TestClient(create_app(_test_settings()))
  client_headers, lawyer_headers, case_id, document = _create_approved_lawyer_letter_case(client, plan_id="full-service")

  messages_after_approval = client.get("/api/v1/messages", headers=client_headers)
  assert messages_after_approval.status_code == 200
  confirmation_message = next(
    message
    for message in messages_after_approval.json()["messages"]
    if message["title"] == "文书已确认" and document["title"] in message["body"]
  )
  assert "提交发送凭证" in confirmation_message["body"]
  assert "记录对方回应" not in confirmation_message["body"]

  copied = client.post(
    f"/api/v1/cases/{case_id}/full-service/actions",
    headers=client_headers,
    json={"action": "copy_document", "note": "客户已复制律师定稿文书"},
  )
  assert copied.status_code == 200
  copied_case = copied.json()["case"]
  copied_letter_stage = next(stage for stage in copied_case["stages"] if stage["key"] == "letter")
  assert copied_case["status"] == "律师函已定稿，待客户自行发送"
  assert copied_letter_stage["status"] == "active"

  missing_proof = client.post(
    f"/api/v1/cases/{case_id}/full-service/actions",
    headers=client_headers,
    json={"action": "submit_send_proof"},
  )
  assert missing_proof.status_code == 409
  assert missing_proof.json()["detail"] == "SEND_PROOF_REQUIRED"

  submitted_proof = client.post(
    f"/api/v1/cases/{case_id}/full-service/actions",
    headers=client_headers,
    json={"action": "submit_send_proof", "channel": "微信", "note": "客户已自行微信发送律师函并截图留存"},
  )
  assert submitted_proof.status_code == 409
  assert submitted_proof.json()["detail"] == "SEND_PROOF_REQUIRED"

  uploaded_send_proof = client.post(
    f"/api/v1/cases/{case_id}/evidence/send_proof",
    headers=client_headers,
    files={"file": ("send-proof.pdf", b"send proof bytes", "application/pdf")},
  )
  assert uploaded_send_proof.status_code == 200

  submitted_proof = client.post(
    f"/api/v1/cases/{case_id}/full-service/actions",
    headers=client_headers,
    json={"action": "submit_send_proof", "channel": "微信", "note": "客户已自行微信发送律师函并截图留存"},
  )
  assert submitted_proof.status_code == 200
  proof_case = submitted_proof.json()["case"]
  proof_letter_stage = next(stage for stage in proof_case["stages"] if stage["key"] == "letter")
  proof_negotiation_stage = next(stage for stage in proof_case["stages"] if stage["key"] == "negotiation")
  assert proof_case["status"] == "发送凭证待律师确认"
  assert proof_letter_stage["status"] == "active"
  assert proof_letter_stage["description"] == "客户已提交发送凭证，待律师确认后进入对方回应阶段"
  assert proof_negotiation_stage["status"] == "todo"

  lawyer_tasks = client.get("/api/v1/lawyer/tasks", headers=lawyer_headers)
  assert lawyer_tasks.status_code == 200
  proof_task = next(
    task for task in lawyer_tasks.json()["tasks"]
    if task["kind"] == "send_proof_review" and task["caseId"] == case_id and task["status"] == "pending"
  )

  premature_response = client.post(
    f"/api/v1/cases/{case_id}/full-service/actions",
    headers=client_headers,
    json={"action": "record_response", "response": "no_response", "note": "五日无回应"},
  )
  assert premature_response.status_code == 409
  assert premature_response.json()["detail"] == "SEND_PROOF_CONFIRMATION_REQUIRED"

  confirmed = client.post(
    f"/api/v1/lawyer/cases/{case_id}/full-service/actions",
    headers=lawyer_headers,
    json={"action": "confirm_send_proof", "note": "已核对发送截图和收函主体"},
  )
  assert confirmed.status_code == 200
  confirmed_case = confirmed.json()["case"]
  confirmed_stages = {stage["key"]: stage for stage in confirmed_case["stages"]}
  assert confirmed_case["status"] == "发送凭证已确认，等待对方回应"
  assert confirmed_stages["letter"]["status"] == "done"
  assert confirmed_stages["negotiation"]["status"] == "active"

  refreshed_tasks = client.get("/api/v1/lawyer/tasks", headers=lawyer_headers)
  refreshed_proof_task = next(task for task in refreshed_tasks.json()["tasks"] if task["id"] == proof_task["id"])
  assert refreshed_proof_task["status"] == "completed"

  recorded_response = client.post(
    f"/api/v1/cases/{case_id}/full-service/actions",
    headers=client_headers,
    json={"action": "record_response", "response": "promised", "note": "对方承诺三日内付款"},
  )
  assert recorded_response.status_code == 200
  response_case = recorded_response.json()["case"]
  response_stages = {stage["key"]: stage for stage in response_case["stages"]}
  assert response_case["status"] == "已记录对方回应，待律师跟进"
  assert response_stages["negotiation"]["status"] == "active"
  assert response_stages["filing"]["status"] == "todo"

  follow_up_tasks = client.get("/api/v1/lawyer/tasks", headers=lawyer_headers)
  assert any(
    task["kind"] == "lawyer_follow_up" and task["caseId"] == case_id and task["status"] == "pending"
    for task in follow_up_tasks.json()["tasks"]
  )


@pytest.mark.parametrize(
  ("decision", "expected_status", "expected_negotiation", "expected_filing", "expected_recovery"),
  [
    ("paid", "对方已履行，案件可结案", "done", "done", "done"),
    ("promised", "对方承诺履行，律师继续跟进", "active", "todo", "todo"),
    ("no_response", "对方无回应或拒绝，进入立案材料准备", "done", "active", "todo"),
    ("rejected", "对方无回应或拒绝，进入立案材料准备", "done", "active", "todo"),
    ("delivery_failed", "发送凭证异常，需重新确认或补充发送", "active", "todo", "todo"),
  ],
)
def test_full_service_lawyer_decision_controls_next_stage(
  decision: str,
  expected_status: str,
  expected_negotiation: str,
  expected_filing: str,
  expected_recovery: str,
) -> None:
  client = TestClient(create_app(_test_settings()))
  client_headers, lawyer_headers, case_id, _document = _create_approved_lawyer_letter_case(client, plan_id="full-service")
  premature_decision = client.post(
    f"/api/v1/lawyer/cases/{case_id}/full-service/actions",
    headers=lawyer_headers,
    json={"action": "decide_response", "decision": "no_response", "note": "律师不能绕过客户回应记录"},
  )
  assert premature_decision.status_code == 409
  assert premature_decision.json()["detail"] == "RESPONSE_REQUIRED"

  uploaded_send_proof = client.post(
    f"/api/v1/cases/{case_id}/evidence/send_proof",
    headers=client_headers,
    files={"file": ("send-proof.pdf", b"send proof bytes", "application/pdf")},
  )
  assert uploaded_send_proof.status_code == 200
  assert client.post(
    f"/api/v1/cases/{case_id}/full-service/actions",
    headers=client_headers,
    json={"action": "submit_send_proof", "channel": "EMS", "note": "EMS 单号 1234567890"},
  ).status_code == 200
  assert client.post(
    f"/api/v1/lawyer/cases/{case_id}/full-service/actions",
    headers=lawyer_headers,
    json={"action": "confirm_send_proof"},
  ).status_code == 200
  assert client.post(
    f"/api/v1/cases/{case_id}/full-service/actions",
    headers=client_headers,
    json={"action": "record_response", "response": "no_response", "note": "七日内未收到回复"},
  ).status_code == 200

  missing_decision = client.post(
    f"/api/v1/lawyer/cases/{case_id}/full-service/actions",
    headers=lawyer_headers,
    json={"action": "decide_response"},
  )
  assert missing_decision.status_code == 409
  assert missing_decision.json()["detail"] == "DECISION_REQUIRED"

  decided = client.post(
    f"/api/v1/lawyer/cases/{case_id}/full-service/actions",
    headers=lawyer_headers,
    json={"action": "decide_response", "decision": decision, "note": f"律师决策：{decision}"},
  )

  assert decided.status_code == 200
  decided_case = decided.json()["case"]
  stages = {stage["key"]: stage for stage in decided_case["stages"]}
  assert decided_case["status"] == expected_status
  assert stages["negotiation"]["status"] == expected_negotiation
  assert stages["filing"]["status"] == expected_filing
  assert stages["recovery"]["status"] == expected_recovery


def test_full_service_actions_require_full_service_plan_and_approved_lawyer_letter() -> None:
  client = TestClient(create_app(_test_settings()))
  client_headers = _register_client(client, phone="13800001234")
  _create_approved_lawyer(client)
  case_id = _create_case(client, client_headers)
  _upload_required_evidence(client, client_headers, case_id)
  assert client.post(f"/api/v1/cases/{case_id}/evaluate", headers=client_headers).status_code == 200
  assert client.post(
    f"/api/v1/cases/{case_id}/plan",
    headers=client_headers,
    json={"planId": "full-service"},
  ).status_code == 200

  no_document_action = client.post(
    f"/api/v1/cases/{case_id}/full-service/actions",
    headers=client_headers,
    json={"action": "submit_send_proof", "channel": "微信", "note": "已发送截图"},
  )
  assert no_document_action.status_code == 409
  assert no_document_action.json()["detail"] == "APPROVED_LAWYER_LETTER_REQUIRED"

  client_headers_self_service = _register_client(client, phone="13800004321")
  self_service_case_id = _create_case(client, client_headers_self_service)
  _upload_required_evidence(client, client_headers_self_service, self_service_case_id)
  assert client.post(f"/api/v1/cases/{self_service_case_id}/evaluate", headers=client_headers_self_service).status_code == 200
  assert client.post(
    f"/api/v1/cases/{self_service_case_id}/plan",
    headers=client_headers_self_service,
    json={"planId": "self-service"},
  ).status_code == 200

  wrong_plan_action = client.post(
    f"/api/v1/cases/{self_service_case_id}/full-service/actions",
    headers=client_headers_self_service,
    json={"action": "submit_send_proof", "channel": "微信", "note": "已发送截图"},
  )
  assert wrong_plan_action.status_code == 409
  assert wrong_plan_action.json()["detail"] == "FULL_SERVICE_REQUIRED"

  approved_client = TestClient(create_app(_test_settings()))
  approved_headers, _lawyer_headers, approved_case_id, _document = _create_approved_lawyer_letter_case(approved_client, plan_id="full-service")
  missing_response = approved_client.post(
    f"/api/v1/cases/{approved_case_id}/full-service/actions",
    headers=approved_headers,
    json={"action": "record_response"},
  )
  assert missing_response.status_code == 409
  assert missing_response.json()["detail"] == "RESPONSE_REQUIRED"


def test_self_service_plan_creates_actionable_ai_guidance_once() -> None:
  client = TestClient(create_app(_test_settings()))
  client_headers = _register_client(client, phone="13800001234")
  lawyer_headers = _create_approved_lawyer(client)
  case_id = _create_case(client, client_headers)
  _upload_required_evidence(client, client_headers, case_id)
  assert client.post(f"/api/v1/cases/{case_id}/evaluate", headers=client_headers).status_code == 200

  selected = client.post(
    f"/api/v1/cases/{case_id}/plan",
    headers=client_headers,
    json={"planId": "self-service"},
  )
  assert selected.status_code == 200
  selected_case = selected.json()["case"]
  assert selected_case["selectedPlan"] == "self-service"
  assert selected_case["status"].startswith("AI自助处理完成：")
  assert "律师复核" not in selected_case["status"]
  review_stage = next(stage for stage in selected_case["stages"] if stage["key"] == "review")
  letter_stage = next(stage for stage in selected_case["stages"] if stage["key"] == "letter")
  active_stage = next(stage for stage in selected_case["stages"] if stage["status"] == "active")
  assert review_stage["status"] == "done"
  assert letter_stage["title"] == "AI自助处理包"
  assert letter_stage["status"] == "active"
  assert active_stage["key"] == "letter"
  assert "律师复核" not in active_stage["title"]

  work_items = client.get(f"/api/v1/cases/{case_id}/work-items", headers=client_headers)
  assert work_items.status_code == 200
  ai_items = [item for item in work_items.json()["workItems"] if item["kind"] == "ai_guidance"]
  assert len(ai_items) == 1
  assert ai_items[0]["status"] == "in_progress"
  assert "付款催告函（AI 自助模板）" in ai_items[0]["summary"]
  assert "复制或下载付款催告函模板" in ai_items[0]["summary"]
  assert "自行发送/使用" in ai_items[0]["summary"]
  assert "按建议发送催告" not in ai_items[0]["summary"]
  assert [item for item in work_items.json()["workItems"] if item["kind"] == "lawyer_review"] == []

  documents = client.get(f"/api/v1/cases/{case_id}/documents", headers=client_headers)
  assert documents.status_code == 200
  self_service_documents = [
    document
    for document in documents.json()["documents"]
    if document["fields"].get("source") == "ai_self_service"
  ]
  assert len(self_service_documents) == 1
  document = self_service_documents[0]
  assert document["type"] == "lawyer_letter"
  assert document["status"] == "approved"
  assert document["title"] == "付款催告函（AI 自助模板）"
  assert "人工智能（AI）生成" in document["body"]
  assert "付款催告函（AI 自助模板）" in document["body"]
  assert "一、发函主体与相对方" in document["body"]
  assert "二、事实摘要" in document["body"]
  assert "三、法律依据" in document["body"]
  assert "以下为通用合同/金钱债务条款，具体适用以事实和证据为准" in document["body"]
  assert "《中华人民共和国民法典》第五百七十七条" in document["body"]
  assert "《中华人民共和国民法典》第五百七十九条" in document["body"]
  assert "《中华人民共和国民法典》第六百七十五条" not in document["body"]
  assert "《中华人民共和国民法典》第六百七十六条" not in document["body"]
  assert "借款合同专门条款" in document["body"]
  assert "四、催告事项" in document["body"]
  assert "五、送达与留痕建议" in document["body"]
  assert "微信、短信、电子邮件或 EMS/顺丰等可查询物流的快递方式" in document["body"]
  assert "自行催告 → 记录回应 → 准备材料或升级人工" in document["body"]
  assert "399 自助版不代发、不代理、不出具正式律师函" in document["body"]
  assert "律师函" in document["body"]
  assert "律师函催告" not in document["body"]
  assert "律师函发送需经律师复核确认" not in document["body"]
  assert "催收函" not in document["body"]
  assert document["fields"]["generatedAt"]

  messages = client.get("/api/v1/messages", headers=client_headers)
  assert messages.status_code == 200
  assert any(message["title"] == "AI自助处理包已生成" for message in messages.json()["messages"])

  lawyer_tasks = client.get("/api/v1/lawyer/tasks", headers=lawyer_headers)
  assert lawyer_tasks.status_code == 200
  assert lawyer_tasks.json()["tasks"] == []

  with client.stream("GET", f"/api/v1/cases/{case_id}/events", headers=client_headers) as events:
    assert events.status_code == 200
    event_body = "".join(events.iter_text())
  assert "event: document.updated" in event_body
  assert "event: task.updated" in event_body

  reevaluated = client.post(f"/api/v1/cases/{case_id}/evaluate", headers=client_headers)
  assert reevaluated.status_code == 409
  assert reevaluated.json()["detail"] == "PLAN_ALREADY_SELECTED"
  current_case = client.get(f"/api/v1/cases/{case_id}", headers=client_headers).json()["case"]
  assert current_case["selectedPlan"] == "self-service"
  assert current_case["status"].startswith("AI自助处理完成：")
  current_letter_stage = next(stage for stage in current_case["stages"] if stage["key"] == "letter")
  current_active_stage = next(stage for stage in current_case["stages"] if stage["status"] == "active")
  assert current_letter_stage["status"] == "active"
  assert current_active_stage["key"] == "letter"

  selected_again = client.post(
    f"/api/v1/cases/{case_id}/plan",
    headers=client_headers,
    json={"planId": "self-service"},
  )
  assert selected_again.status_code == 200
  repeated_work_items = client.get(f"/api/v1/cases/{case_id}/work-items", headers=client_headers)
  repeated_ai_items = [item for item in repeated_work_items.json()["workItems"] if item["kind"] == "ai_guidance"]
  assert len(repeated_ai_items) == 1
  repeated_documents = client.get(f"/api/v1/cases/{case_id}/documents", headers=client_headers)
  repeated_self_service_documents = [
    document
    for document in repeated_documents.json()["documents"]
    if document["fields"].get("source") == "ai_self_service"
  ]
  assert len(repeated_self_service_documents) == 1


@pytest.mark.parametrize(
  ("case_type", "expected_title", "expected_terms", "forbidden_terms"),
  [
    (
      "debt_collection",
      "付款催告函（AI 自助模板）",
      ("第五百七十七条", "第五百七十九条", "第五百八十三条", "借款合同专门条款需在确认存在借款法律关系后再适用"),
      ("第六百七十五条", "第六百七十六条", "正式律师函需律师复核确认"),
    ),
    (
      "lawyer_letter",
      "函件草稿（AI生成）",
      ("《中华人民共和国律师法》第二十八条", "普通函件草稿", "不以律师或律所名义出具正式律师函"),
      ("付款催告函", "欠款追偿", "债务人"),
    ),
    (
      "labor_dispute",
      "劳动仲裁申请建议书（AI生成）",
      ("劳动争议调解仲裁法》第二条", "劳动争议调解仲裁法》第二十七条", "劳动合同法》第三十条", "劳动仲裁"),
      ("付款催告函", "欠款追偿", "债务人"),
    ),
    (
      "rental_dispute",
      "租赁纠纷协商函（AI草稿）",
      ("民法典》第七百零三条", "民法典》第七百二十一条", "民法典》第七百二十二条", "押金返还"),
      ("付款催告函", "欠款追偿", "债务人"),
    ),
    (
      "contract_review",
      "合同审查意见（AI生成）",
      ("民法典》第四百六十五条", "民法典》第四百七十条", "民法典》第四百九十六条", "风险清单"),
      ("付款催告函", "欠款追偿", "债务人", "发送律师函"),
    ),
  ],
)
def test_self_service_documents_use_case_specific_legal_knowledge(
  case_type: str,
  expected_title: str,
  expected_terms: tuple[str, ...],
  forbidden_terms: tuple[str, ...],
) -> None:
  client = TestClient(create_app(_test_settings()))
  client_headers = _register_client(client, phone=f"138{len(case_type):08d}")
  case_id = _create_case(client, client_headers, case_type=case_type)
  _upload_required_evidence(client, client_headers, case_id)
  assert client.post(f"/api/v1/cases/{case_id}/evaluate", headers=client_headers).status_code == 200

  selected = client.post(
    f"/api/v1/cases/{case_id}/plan",
    headers=client_headers,
    json={"planId": "self-service"},
  )
  assert selected.status_code == 200
  selected_case = selected.json()["case"]
  assert selected_case["selectedPlan"] == "self-service"
  assert selected_case["status"].startswith("AI自助处理完成：")

  documents = client.get(f"/api/v1/cases/{case_id}/documents", headers=client_headers)
  assert documents.status_code == 200
  self_service_documents = [
    document
    for document in documents.json()["documents"]
    if document["fields"].get("source") == "ai_self_service"
  ]
  assert len(self_service_documents) == 1
  document = self_service_documents[0]
  assert expected_title in document["title"]
  assert document["fields"]["caseType"] == case_type
  assert document["fields"]["legalKnowledgeVersion"] == "cn-law-self-service-2026-07-09"
  assert document["fields"]["legalReferences"]
  assert all(reference["law"].startswith("《中华人民共和国") for reference in document["fields"]["legalReferences"])
  assert all(reference["article"] and reference["sourceUrl"] for reference in document["fields"]["legalReferences"])
  assert "人工智能（AI）生成" in document["body"]
  assert "399 自助版不代发、不代理、不出具正式律师函" in document["body"]
  assert "法律依据" in document["body"]
  for term in expected_terms:
    assert term in document["body"]
  for term in forbidden_terms:
    assert term not in document["body"]


def test_self_service_llm_enhancement_falls_back_when_legal_basis_is_invalid(monkeypatch) -> None:
  client = TestClient(create_app(_test_settings(
    OPENAI_API_BASE="https://llm.example.test/v1",
    OPENAI_API_KEY="test-key",
    DEFAULT_LLM_MODEL="test-model",
  )))
  client_headers = _register_client(client, phone="13800004567")
  case_id = _create_case(client, client_headers, case_type="contract_review")
  _upload_required_evidence(client, client_headers, case_id)
  assert client.post(f"/api/v1/cases/{case_id}/evaluate", headers=client_headers).status_code == 200

  def invalid_enhanced_body(_settings, _law_case, _template_body):
    return "付款催告函（AI 自助模板）\n\n缺少法律依据，且错误串入欠款追偿和债务人。"

  monkeypatch.setattr(store_module, "generate_self_service_document_body", invalid_enhanced_body)

  selected = client.post(
    f"/api/v1/cases/{case_id}/plan",
    headers=client_headers,
    json={"planId": "self-service"},
  )

  assert selected.status_code == 200
  documents = client.get(f"/api/v1/cases/{case_id}/documents", headers=client_headers)
  document = next(
    item
    for item in documents.json()["documents"]
    if item["fields"].get("source") == "ai_self_service"
  )
  assert "合同审查意见（AI生成）" in document["title"]
  assert "二、法律依据与审查口径" in document["body"]
  assert "《中华人民共和国民法典》第四百六十五条" in document["body"]
  assert "《中华人民共和国民法典》第五百零九条" in document["body"]
  assert "付款催告函" not in document["body"]
  assert "欠款追偿" not in document["body"]
  assert "债务人" not in document["body"]


def test_self_service_actions_advance_mvp_loop() -> None:
  client = TestClient(create_app(_test_settings()))
  client_headers = _register_client(client, phone="13800001234")
  case_id = _create_case(client, client_headers)
  _upload_required_evidence(client, client_headers, case_id)
  assert client.post(f"/api/v1/cases/{case_id}/evaluate", headers=client_headers).status_code == 200
  assert client.post(
    f"/api/v1/cases/{case_id}/plan",
    headers=client_headers,
    json={"planId": "self-service"},
  ).status_code == 200

  sent = client.post(
    f"/api/v1/cases/{case_id}/self-service/actions",
    headers=client_headers,
    json={"action": "mark_sent", "channel": "EMS", "note": "已自行寄出催告材料"},
  )
  assert sent.status_code == 200
  sent_case = sent.json()["case"]
  letter_stage = next(stage for stage in sent_case["stages"] if stage["key"] == "letter")
  negotiation_stage = next(stage for stage in sent_case["stages"] if stage["key"] == "negotiation")
  assert letter_stage["status"] == "done"
  assert negotiation_stage["status"] == "active"
  assert sent_case["status"] == "已自行处理，等待对方回应"

  no_response = client.post(
    f"/api/v1/cases/{case_id}/self-service/actions",
    headers=client_headers,
    json={"action": "record_response", "response": "no_response", "note": "三日未回应"},
  )
  assert no_response.status_code == 200
  no_response_case = no_response.json()["case"]
  filing_stage = next(stage for stage in no_response_case["stages"] if stage["key"] == "filing")
  assert filing_stage["status"] == "active"
  assert no_response_case["status"] == "建议准备材料或升级人工服务"

  paid = client.post(
    f"/api/v1/cases/{case_id}/self-service/actions",
    headers=client_headers,
    json={"action": "record_response", "response": "paid", "note": "已回款"},
  )
  assert paid.status_code == 200
  paid_case = paid.json()["case"]
  paid_filing_stage = next(stage for stage in paid_case["stages"] if stage["key"] == "filing")
  recovery_stage = next(stage for stage in paid_case["stages"] if stage["key"] == "recovery")
  assert paid_filing_stage["status"] == "done"
  assert recovery_stage["status"] == "done"
  assert all(stage["status"] != "active" for stage in paid_case["stages"])
  assert paid_case["status"] == "已完成自助处理"


def test_self_service_upgrade_hands_off_without_repeating_actions() -> None:
  client = TestClient(create_app(_test_settings()))
  client_headers = _register_client(client, phone="13800001234")
  case_id = _create_case(client, client_headers)
  _upload_required_evidence(client, client_headers, case_id)
  assert client.post(f"/api/v1/cases/{case_id}/evaluate", headers=client_headers).status_code == 200
  assert client.post(
    f"/api/v1/cases/{case_id}/plan",
    headers=client_headers,
    json={"planId": "self-service"},
  ).status_code == 200
  assert client.post(
    f"/api/v1/cases/{case_id}/self-service/actions",
    headers=client_headers,
    json={"action": "mark_sent", "note": "已自行发送"},
  ).status_code == 200
  assert client.post(
    f"/api/v1/cases/{case_id}/self-service/actions",
    headers=client_headers,
    json={"action": "record_response", "response": "no_response", "note": "对方拒绝"},
  ).status_code == 200

  upgraded = client.post(
    f"/api/v1/cases/{case_id}/self-service/actions",
    headers=client_headers,
    json={"action": "upgrade_service", "note": "申请人工服务"},
  )

  assert upgraded.status_code == 200
  upgraded_case = upgraded.json()["case"]
  assert upgraded_case["status"] == "已申请升级人工服务"
  letter_stage = next(stage for stage in upgraded_case["stages"] if stage["key"] == "letter")
  negotiation_stage = next(stage for stage in upgraded_case["stages"] if stage["key"] == "negotiation")
  filing_stage = next(stage for stage in upgraded_case["stages"] if stage["key"] == "filing")
  recovery_stage = next(stage for stage in upgraded_case["stages"] if stage["key"] == "recovery")
  assert letter_stage["status"] == "done"
  assert negotiation_stage["status"] == "done"
  assert filing_stage["status"] == "done"
  assert recovery_stage["status"] == "todo"
  assert all(stage["status"] != "active" for stage in upgraded_case["stages"])

  work_items = client.get(f"/api/v1/cases/{case_id}/work-items", headers=client_headers)
  assert work_items.status_code == 200
  guidance_items = [item for item in work_items.json()["workItems"] if item["kind"] == "ai_guidance"]
  assert guidance_items[0]["status"] == "completed"


def test_lawyer_review_plan_keeps_standard_lawyer_letter_stage() -> None:
  client = TestClient(create_app(_test_settings()))
  client_headers = _register_client(client, phone="13800001234")
  case_id = _create_case(client, client_headers)
  _upload_required_evidence(client, client_headers, case_id)
  assert client.post(f"/api/v1/cases/{case_id}/evaluate", headers=client_headers).status_code == 200

  selected = client.post(
    f"/api/v1/cases/{case_id}/plan",
    headers=client_headers,
    json={"planId": "lawyer-review"},
  )

  assert selected.status_code == 200
  selected_case = selected.json()["case"]
  letter_stage = next(stage for stage in selected_case["stages"] if stage["key"] == "letter")
  assert letter_stage["title"] == "发送律师函"
  assert letter_stage["description"] == "生成并发送律师函"


def test_full_service_plan_keeps_standard_service_stages() -> None:
  client = TestClient(create_app(_test_settings()))
  client_headers = _register_client(client, phone="13800001234")
  case_id = _create_case(client, client_headers)
  _upload_required_evidence(client, client_headers, case_id)
  assert client.post(f"/api/v1/cases/{case_id}/evaluate", headers=client_headers).status_code == 200

  selected = client.post(
    f"/api/v1/cases/{case_id}/plan",
    headers=client_headers,
    json={"planId": "full-service"},
  )

  assert selected.status_code == 200
  selected_case = selected.json()["case"]
  letter_stage = next(stage for stage in selected_case["stages"] if stage["key"] == "letter")
  negotiation_stage = next(stage for stage in selected_case["stages"] if stage["key"] == "negotiation")
  send_proof_category = next(category for category in selected_case["evidence"] if category["id"] == "send_proof")
  assert letter_stage["title"] == "发送律师函"
  assert letter_stage["description"] == "生成并发送律师函"
  assert negotiation_stage["title"] == "协商调解"
  assert send_proof_category["name"] == "发送/送达凭证"
  assert send_proof_category["required"] is False


def test_self_service_action_requires_self_service_plan() -> None:
  client = TestClient(create_app(_test_settings()))
  client_headers = _register_client(client, phone="13800001234")
  case_id = _create_case(client, client_headers)
  _upload_required_evidence(client, client_headers, case_id)
  assert client.post(f"/api/v1/cases/{case_id}/evaluate", headers=client_headers).status_code == 200
  assert client.post(
    f"/api/v1/cases/{case_id}/plan",
    headers=client_headers,
    json={"planId": "lawyer-review"},
  ).status_code == 200

  action = client.post(
    f"/api/v1/cases/{case_id}/self-service/actions",
    headers=client_headers,
    json={"action": "mark_sent"},
  )

  assert action.status_code == 409
  assert action.json()["detail"] == "SELF_SERVICE_REQUIRED"


def test_lawyer_can_read_case_evidence_file(tmp_path: Path) -> None:
  client = TestClient(create_app(_test_settings(UPLOAD_DIR=str(tmp_path))))
  client_headers = _register_client(client, phone="13800001234")
  lawyer_headers = _create_approved_lawyer(client)
  case_id = _create_case(client, client_headers)

  upload = client.post(
    f"/api/v1/cases/{case_id}/evidence/contract",
    headers=client_headers,
    files={"file": ("contract.pdf", b"contract bytes", "application/pdf")},
  )
  assert upload.status_code == 200
  file_id = upload.json()["file"]["id"]
  _upload_required_evidence(client, client_headers, case_id)
  assert client.post(f"/api/v1/cases/{case_id}/evaluate", headers=client_headers).status_code == 200
  assert client.post(
    f"/api/v1/cases/{case_id}/plan",
    headers=client_headers,
    json={"planId": "lawyer-review"},
  ).status_code == 200

  evidence_file = client.get(
    f"/api/v1/lawyer/cases/{case_id}/evidence/contract/files/{file_id}",
    headers=lawyer_headers,
  )
  assert evidence_file.status_code == 200
  assert evidence_file.content == b"contract bytes"
  assert evidence_file.headers["content-type"].startswith("application/pdf")
  assert "inline" in evidence_file.headers["content-disposition"]

  forbidden = client.get(
    f"/api/v1/lawyer/cases/{case_id}/evidence/contract/files/{file_id}",
    headers=client_headers,
  )
  assert forbidden.status_code == 403

  missing = client.get(
    f"/api/v1/lawyer/cases/{case_id}/evidence/contract/files/missing-file",
    headers=lawyer_headers,
  )
  assert missing.status_code == 404
  assert missing.json()["detail"] == "EVIDENCE_FILE_NOT_FOUND"


def test_assessment_failure_is_recorded_as_event(monkeypatch) -> None:
  client = TestClient(create_app(_test_settings()))
  headers = _register_client(client)
  case_id = _create_case(client, headers)

  def fail_assessment(_law_case):
    raise RuntimeError("workflow unavailable")

  monkeypatch.setattr(store_module, "assess_case", fail_assessment)

  _upload_required_evidence(client, headers, case_id)
  evaluated = client.post(f"/api/v1/cases/{case_id}/evaluate", headers=headers)
  assert evaluated.status_code == 200
  response = evaluated.json()
  assert response["case"]["status"] == "评估失败"
  assert response["job"]["status"] == "failed"
  assert response["job"]["errorCode"] == "WORKFLOW_FAILED"

  with client.stream("GET", f"/api/v1/cases/{case_id}/events", headers=headers) as events:
    assert events.status_code == 200
    event_body = "".join(events.iter_text())
  assert '"title":"AI评估失败"' in event_body
  assert '"errorCode":"WORKFLOW_FAILED"' in event_body


def test_client_registration_requires_consent_and_returns_session() -> None:
  client = TestClient(create_app(_test_settings()))
  code = _request_code(client, "13800001234", "register")

  missing_consent = client.post(
    "/api/v1/auth/register/client",
    json={
      "phone": "13800001234",
      "code": code,
      "name": "王先生",
      "acceptedTerms": True,
      "acceptedPrivacy": False,
    },
  )
  assert missing_consent.status_code == 422

  registered = client.post(
    "/api/v1/auth/register/client",
    json={
      "phone": "13800001234",
      "code": code,
      "name": "王先生",
      "acceptedTerms": True,
      "acceptedPrivacy": True,
    },
  )
  assert registered.status_code == 200
  body = registered.json()
  assert body["token"]
  assert body["user"]["role"] == "client"
  assert body["user"]["accountStatus"] == "active"
  assert body["user"]["lawyerReviewStatus"] == "none"


def test_first_login_creates_active_client_user() -> None:
  client = TestClient(create_app(_test_settings()))
  code = _request_code(client, "13800007777")

  response = client.post("/api/v1/auth/login", json={"phone": "13800007777", "code": code})

  assert response.status_code == 200
  body = response.json()
  assert body["token"]
  assert body["user"]["phone"] == "13800007777"
  assert body["user"]["name"] == "用户7777"
  assert body["user"]["role"] == "client"
  assert body["user"]["accountStatus"] == "active"
  assert body["user"]["lawyerReviewStatus"] == "none"

  me = client.get("/api/v1/me", headers={"Authorization": f"Bearer {body['token']}"})
  assert me.status_code == 200
  assert me.json()["user"]["id"] == body["user"]["id"]


def test_lawyer_onboarding_keeps_pending_lawyer_out_of_lawyer_apis() -> None:
  client = TestClient(create_app(_test_settings()))
  headers = _onboard_lawyer(client, phone="13900008888")

  me_response = client.get("/api/v1/me", headers=headers)
  assert me_response.status_code == 200
  assert me_response.json()["user"]["lawyerReviewStatus"] == "pending_review"

  tasks_response = client.get("/api/v1/lawyer/tasks", headers=headers)
  assert tasks_response.status_code == 403
  assert tasks_response.json()["detail"] == "LAWYER_NOT_APPROVED"


def test_admin_approval_enables_lawyer_access() -> None:
  client = TestClient(create_app(_test_settings(ADMIN_PHONE="13600000000", ADMIN_NAME="平台管理员")))
  lawyer_headers = _onboard_lawyer(client, phone="13900008888")
  admin_headers = _login(client, phone="13600000000")
  lawyer_id = client.get("/api/v1/me", headers=lawyer_headers).json()["user"]["id"]

  approved = client.post(
    f"/api/v1/admin/lawyers/{lawyer_id}/review",
    headers=admin_headers,
    json={"status": "approved"},
  )
  assert approved.status_code == 200
  assert approved.json()["user"]["lawyerReviewStatus"] == "approved"

  tasks_response = client.get("/api/v1/lawyer/tasks", headers=lawyer_headers)
  assert tasks_response.status_code == 200


def test_admin_rejection_stores_reason_and_rejected_lawyer_is_denied() -> None:
  client = TestClient(create_app(_test_settings(ADMIN_PHONE="13600000000", ADMIN_NAME="平台管理员")))
  lawyer_headers = _onboard_lawyer(client, phone="13900008888")
  admin_headers = _login(client, phone="13600000000")
  lawyer_id = client.get("/api/v1/me", headers=lawyer_headers).json()["user"]["id"]

  rejected = client.post(
    f"/api/v1/admin/lawyers/{lawyer_id}/review",
    headers=admin_headers,
    json={"status": "rejected", "rejectedReason": "执业证号无法核验"},
  )
  assert rejected.status_code == 200
  assert rejected.json()["user"]["lawyerReviewStatus"] == "rejected"
  assert rejected.json()["user"]["rejectedReason"] == "执业证号无法核验"

  me_response = client.get("/api/v1/me", headers=lawyer_headers)
  assert me_response.status_code == 200
  assert me_response.json()["user"]["rejectedReason"] == "执业证号无法核验"

  tasks_response = client.get("/api/v1/lawyer/tasks", headers=lawyer_headers)
  assert tasks_response.status_code == 403
  assert tasks_response.json()["detail"] == "LAWYER_REJECTED"


def test_admin_can_disable_user_and_disabled_token_is_rejected() -> None:
  client = TestClient(create_app(_test_settings(ADMIN_PHONE="13600000000", ADMIN_NAME="平台管理员")))
  client_headers = _register_client(client, phone="13800001234")
  admin_headers = _login(client, phone="13600000000")
  user_id = client.get("/api/v1/me", headers=client_headers).json()["user"]["id"]

  disabled = client.patch(
    f"/api/v1/admin/users/{user_id}",
    headers=admin_headers,
    json={"accountStatus": "disabled"},
  )
  assert disabled.status_code == 200
  assert disabled.json()["user"]["accountStatus"] == "disabled"

  me_response = client.get("/api/v1/me", headers=client_headers)
  assert me_response.status_code == 403
  assert me_response.json()["detail"] == "ACCOUNT_DISABLED"


def test_disabled_users_cannot_restore_through_public_registration_or_onboarding() -> None:
  client = TestClient(create_app(_test_settings(ADMIN_PHONE="13600000000", ADMIN_NAME="平台管理员")))
  admin_headers = _login(client, phone="13600000000")
  client_headers = _register_client(client, phone="13800001234")
  second_client_headers = _register_client(client, phone="13800005678", name="李女士")
  client_user_id = client.get("/api/v1/me", headers=client_headers).json()["user"]["id"]
  second_user_id = client.get("/api/v1/me", headers=second_client_headers).json()["user"]["id"]

  for user_id in [client_user_id, second_user_id]:
    disabled = client.patch(
      f"/api/v1/admin/users/{user_id}",
      headers=admin_headers,
      json={"accountStatus": "disabled"},
    )
    assert disabled.status_code == 200

  register_code = _request_code(client, "13800001234", "register")
  register_response = client.post(
    "/api/v1/auth/register/client",
    json={
      "phone": "13800001234",
      "code": register_code,
      "name": "王先生",
      "acceptedTerms": True,
      "acceptedPrivacy": True,
    },
  )
  assert register_response.status_code == 403
  assert register_response.json()["detail"] == "ACCOUNT_DISABLED"

  onboard_code = _request_code(client, "13800005678", "register")
  onboard_response = client.post(
    "/api/v1/auth/onboard-lawyer",
    json={
      "phone": "13800005678",
      "code": onboard_code,
      "name": "李律师",
      "lawFirm": "上海正衡律师事务所",
      "licenseNumber": "13101202010123456",
      "practiceRegion": "上海",
      "specialties": ["合同纠纷"],
      "acceptedTerms": True,
      "acceptedPrivacy": True,
    },
  )
  assert onboard_response.status_code == 403
  assert onboard_response.json()["detail"] == "ACCOUNT_DISABLED"


def test_admin_role_updates_and_final_active_admin_protection() -> None:
  client = TestClient(create_app(_test_settings(ADMIN_PHONE="13600000000", ADMIN_NAME="平台管理员")))
  admin_headers = _login(client, phone="13600000000")
  admin_user = client.get("/api/v1/me", headers=admin_headers).json()["user"]
  client_headers = _register_client(client, phone="13800001234")
  client_user_id = client.get("/api/v1/me", headers=client_headers).json()["user"]["id"]

  promoted = client.patch(
    f"/api/v1/admin/users/{client_user_id}",
    headers=admin_headers,
    json={"role": "admin"},
  )
  assert promoted.status_code == 200
  assert promoted.json()["user"]["role"] == "admin"

  demoted = client.patch(
    f"/api/v1/admin/users/{client_user_id}",
    headers=admin_headers,
    json={"role": "client"},
  )
  assert demoted.status_code == 200

  final_admin_demote = client.patch(
    f"/api/v1/admin/users/{admin_user['id']}",
    headers=admin_headers,
    json={"role": "client"},
  )
  assert final_admin_demote.status_code == 409
  assert final_admin_demote.json()["detail"] == "LAST_ADMIN_REQUIRED"

  final_admin_disable = client.patch(
    f"/api/v1/admin/users/{admin_user['id']}",
    headers=admin_headers,
    json={"accountStatus": "disabled"},
  )
  assert final_admin_disable.status_code == 409
  assert final_admin_disable.json()["detail"] == "LAST_ADMIN_REQUIRED"


def test_admin_cannot_be_changed_to_lawyer_through_public_onboarding() -> None:
  client = TestClient(create_app(_test_settings(ADMIN_PHONE="13600000000", ADMIN_NAME="平台管理员")))
  admin_headers = _login(client, phone="13600000000")
  admin_before = client.get("/api/v1/me", headers=admin_headers).json()["user"]
  assert admin_before["role"] == "admin"

  code = _request_code(client, "13600000000", "register")
  response = client.post(
    "/api/v1/auth/onboard-lawyer",
    json={
      "phone": "13600000000",
      "code": code,
      "name": "平台管理员",
      "lawFirm": "北京中正律师事务所",
      "licenseNumber": "11101202010123456",
      "practiceRegion": "北京",
      "specialties": ["平台运营"],
      "acceptedTerms": True,
      "acceptedPrivacy": True,
    },
  )
  assert response.status_code == 403
  assert response.json()["detail"] == "FORBIDDEN"

  admin_after = client.get("/api/v1/me", headers=admin_headers).json()["user"]
  assert admin_after["role"] == "admin"


def test_admin_cases_are_admin_only() -> None:
  client = TestClient(create_app(_test_settings(ADMIN_PHONE="13600000000", ADMIN_NAME="平台管理员")))
  client_headers = _register_client(client, phone="13800001234")
  admin_headers = _login(client, phone="13600000000")
  case_id = _create_case(client, client_headers)

  admin_cases = client.get("/api/v1/admin/cases", headers=admin_headers)
  assert admin_cases.status_code == 200
  case_ids = [law_case["id"] for law_case in admin_cases.json()["cases"]]
  assert case_id in case_ids

  client_cases = client.get("/api/v1/admin/cases", headers=client_headers)
  assert client_cases.status_code == 403
  assert client_cases.json()["detail"] == "FORBIDDEN"


def _login(client: TestClient, phone: str = "13800001234") -> dict[str, str]:
  code = _request_code(client, phone)

  login_response = client.post(
    "/api/v1/auth/login",
    json={"phone": phone, "code": code},
  )
  assert login_response.status_code == 200
  token = login_response.json()["token"]
  headers = {"Authorization": f"Bearer {token}"}

  me_response = client.get("/api/v1/me", headers=headers)
  assert me_response.status_code == 200
  assert me_response.json()["user"]["phone"] == phone
  return headers


def _request_code(client: TestClient, phone: str, purpose: str = "login") -> str:
  code_response = client.post("/api/v1/auth/request-code", json={"phone": phone, "purpose": purpose})
  assert code_response.status_code == 200
  assert code_response.json()["mockCode"] == "654321"
  return code_response.json()["mockCode"]


def _register_client(client: TestClient, phone: str = "13800001234", name: str = "王先生", password: str | None = None) -> dict[str, str]:
  code = _request_code(client, phone, "register")
  payload = {
    "phone": phone,
    "code": code,
    "name": name,
    "acceptedTerms": True,
    "acceptedPrivacy": True,
  }
  if password is not None:
    payload["password"] = password
  response = client.post(
    "/api/v1/auth/register/client",
    json=payload,
  )
  assert response.status_code == 200
  token = response.json()["token"]
  return {"Authorization": f"Bearer {token}"}


def _onboard_lawyer(client: TestClient, phone: str = "13900008888", password: str | None = None) -> dict[str, str]:
  code = _request_code(client, phone, "register")
  payload = {
    "phone": phone,
    "code": code,
    "name": "赵律师",
    "lawFirm": "北京中正律师事务所",
    "licenseNumber": "11101202010123456",
    "practiceRegion": "北京",
    "specialties": ["合同纠纷", "债务催收"],
    "acceptedTerms": True,
    "acceptedPrivacy": True,
  }
  if password is not None:
    payload["password"] = password
  response = client.post(
    "/api/v1/auth/onboard-lawyer",
    json=payload,
  )
  assert response.status_code == 200
  token = response.json()["token"]
  return {"Authorization": f"Bearer {token}"}


def _create_approved_lawyer(client: TestClient, phone: str = "13900008888") -> dict[str, str]:
  settings = client.app.state.settings
  admin_phone = settings.ADMIN_PHONE or "13600000000"
  admin_name = settings.ADMIN_NAME or "平台管理员"
  client.app.state.store.create_admin(admin_phone, admin_name)
  lawyer_headers = _onboard_lawyer(client, phone=phone)
  admin_headers = _login(client, phone=admin_phone)
  lawyer_id = client.get("/api/v1/me", headers=lawyer_headers).json()["user"]["id"]
  response = client.post(
    f"/api/v1/admin/lawyers/{lawyer_id}/review",
    headers=admin_headers,
    json={"status": "approved"},
  )
  assert response.status_code == 200
  return lawyer_headers


def _create_approved_lawyer_letter_case(
  client: TestClient,
  plan_id: str = "lawyer-review",
) -> tuple[dict[str, str], dict[str, str], str, dict]:
  client_headers = _register_client(client, phone="13800001234")
  lawyer_headers = _create_approved_lawyer(client)
  case_id = _create_case(client, client_headers)
  _upload_required_evidence(client, client_headers, case_id)
  assert client.post(f"/api/v1/cases/{case_id}/evaluate", headers=client_headers).status_code == 200
  assert client.post(
    f"/api/v1/cases/{case_id}/plan",
    headers=client_headers,
    json={"planId": plan_id},
  ).status_code == 200
  task = client.get("/api/v1/lawyer/tasks", headers=lawyer_headers).json()["tasks"][0]
  assert client.post(
    f"/api/v1/lawyer/tasks/{task['id']}/review",
    headers=lawyer_headers,
    json={
      "conclusion": "材料基本完整，可先发律师函催告。",
      "riskLevel": "medium",
      "evidenceGaps": [],
      "advice": "建议先发送律师函，保留后续诉讼准备。",
      "nextAction": "draft_lawyer_letter",
    },
  ).status_code == 200
  created_document = client.post(
    f"/api/v1/lawyer/cases/{case_id}/documents",
    headers=lawyer_headers,
    json={
      "type": "lawyer_letter",
      "title": "正式催款律师函",
      "fields": {
        "recipient": "北京YY贸易有限公司",
        "request": "请于三日内支付欠款",
        "deadline": "三日内",
      },
      "body": "请贵司收到本函后三日内支付全部欠款及逾期损失。",
    },
  )
  assert created_document.status_code == 201
  document = created_document.json()["document"]
  assert client.post(
    f"/api/v1/lawyer/cases/{case_id}/documents/{document['id']}/submit",
    headers=lawyer_headers,
  ).status_code == 200
  approved_document = client.post(
    f"/api/v1/cases/{case_id}/documents/{document['id']}/approve",
    headers=client_headers,
  )
  assert approved_document.status_code == 200
  return client_headers, lawyer_headers, case_id, approved_document.json()["document"]


def _create_case(client: TestClient, headers: dict[str, str], case_type: str = "debt_collection") -> str:
  case_payloads = {
    "debt_collection": {
      "debtorName": "北京YY贸易有限公司",
      "amount": 52300,
      "dispute": "对方确认收货后长期拖欠尾款，已有多次书面催收记录。",
      "partyRole": "债权人",
      "claimType": "货款追偿",
      "claimSummary": "对方拖欠合同尾款，需要自行催告并保留送达记录。",
    },
    "lawyer_letter": {
      "debtorName": "海南有钱公司",
      "amount": 80000,
      "dispute": "相对方未按约履行合作义务，需要发送普通函件草稿进行事实核对和履行提醒。",
      "partyRole": "权利主张方",
      "claimType": "履行催告",
      "claimSummary": "需要函件草稿提醒对方核对事实、限期回复并保留沟通记录。",
    },
    "labor_dispute": {
      "debtorName": "上海用工科技有限公司",
      "amount": 36000,
      "dispute": "用人单位拖欠工资并要求离职，需要整理劳动关系证据和仲裁准备材料。",
      "partyRole": "劳动者",
      "claimType": "拖欠工资",
      "claimSummary": "需要核对工资流水、考勤和沟通记录，准备劳动仲裁材料。",
    },
    "rental_dispute": {
      "debtorName": "杭州房东服务有限公司",
      "amount": 12000,
      "dispute": "退租后相对方拒绝返还押金并主张房屋损坏，需要整理租赁合同和交接证据协商处理。",
      "partyRole": "承租人",
      "claimType": "押金返还",
      "claimSummary": "需要协商押金返还和房屋状态争议，并保留交接、照片和沟通记录。",
    },
    "contract_review": {
      "debtorName": "深圳合作伙伴有限公司",
      "amount": 200000,
      "dispute": "拟签署服务合同，需要识别付款、验收、违约、解除和争议解决条款风险。",
      "partyRole": "合同审查申请人",
      "claimType": "服务合同审查",
      "claimSummary": "需要输出合同风险清单、修改建议和需人工复核的重点条款。",
    },
  }
  case_payload = case_payloads[case_type]
  created = client.post(
    "/api/v1/cases",
    headers=headers,
    json={
      "caseType": case_type,
      "debtorName": case_payload["debtorName"],
      "contactName": "李女士",
      "contactPhone": "13900001111",
      "amount": case_payload["amount"],
      "contractDate": "2024-05-02",
      "dispute": case_payload["dispute"],
      "dueStatus": "已到期",
      "partyRole": case_payload["partyRole"],
      "counterpartyName": case_payload["debtorName"],
      "claimType": case_payload["claimType"],
      "claimSummary": case_payload["claimSummary"],
    },
  )
  assert created.status_code == 201
  law_case = created.json()["case"]
  case_id = law_case["id"]
  assert law_case["status"].startswith("待补充")
  return case_id


def _upload_required_evidence(client: TestClient, headers: dict[str, str], case_id: str) -> None:
  current = client.get(f"/api/v1/cases/{case_id}", headers=headers)
  assert current.status_code == 200
  for category in current.json()["case"]["evidence"]:
    if not category["required"] or category["files"] or category["status"] == "recognized":
      continue
    uploaded = client.post(
      f"/api/v1/cases/{case_id}/evidence/{category['id']}",
      headers=headers,
      files={"file": (f"{category['id']}.pdf", f"{category['name']} bytes".encode(), "application/pdf")},
    )
    assert uploaded.status_code == 200
