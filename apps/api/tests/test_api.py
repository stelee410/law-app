import os
from pathlib import Path

os.environ["STORAGE_BACKEND"] = "memory"
os.environ["OPENAI_API_BASE"] = ""
os.environ["OPENAI_API_KEY"] = ""
os.environ["DEFAULT_LLM_MODEL"] = ""

from fastapi.testclient import TestClient

from app import store as store_module
from app.core.config import Settings
from app.main import create_app


def _test_settings(**overrides) -> Settings:
  values = {
    "MOCK_OTP_CODE": "654321",
    "STORAGE_BACKEND": "memory",
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
  assert approved_document.json()["case"]["status"] == "律师函已确认"

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
  assert letter_stage["status"] == "done"
  assert active_stage["key"] == "negotiation"
  assert active_stage["key"] != "letter"
  assert "律师复核" not in active_stage["title"]

  work_items = client.get(f"/api/v1/cases/{case_id}/work-items", headers=client_headers)
  assert work_items.status_code == 200
  ai_items = [item for item in work_items.json()["workItems"] if item["kind"] == "ai_guidance"]
  assert len(ai_items) == 1
  assert ai_items[0]["status"] == "completed"
  assert "草稿" in ai_items[0]["summary"]
  assert "下一步" in ai_items[0]["summary"]
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
  assert "人工智能（AI）生成" in document["body"]
  assert document["fields"]["generatedAt"]

  messages = client.get("/api/v1/messages", headers=client_headers)
  assert messages.status_code == 200
  assert any(message["title"] == "AI自助处理结果已生成" for message in messages.json()["messages"])

  lawyer_tasks = client.get("/api/v1/lawyer/tasks", headers=lawyer_headers)
  assert lawyer_tasks.status_code == 200
  assert lawyer_tasks.json()["tasks"] == []

  with client.stream("GET", f"/api/v1/cases/{case_id}/events", headers=client_headers) as events:
    assert events.status_code == 200
    event_body = "".join(events.iter_text())
  assert "event: document.updated" in event_body
  assert "event: task.updated" in event_body

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
  code = _request_code(client, "13800001234")

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


def test_login_does_not_create_unknown_user() -> None:
  client = TestClient(create_app(_test_settings()))
  code = _request_code(client, "13800007777")

  response = client.post("/api/v1/auth/login", json={"phone": "13800007777", "code": code})

  assert response.status_code == 404
  assert response.json()["detail"] == "USER_NOT_FOUND"


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

  register_code = _request_code(client, "13800001234")
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

  onboard_code = _request_code(client, "13800005678")
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

  code = _request_code(client, "13600000000")
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


def _request_code(client: TestClient, phone: str) -> str:
  code_response = client.post("/api/v1/auth/request-code", json={"phone": phone})
  assert code_response.status_code == 200
  assert code_response.json()["mockCode"] == "654321"
  return code_response.json()["mockCode"]


def _register_client(client: TestClient, phone: str = "13800001234", name: str = "王先生") -> dict[str, str]:
  code = _request_code(client, phone)
  response = client.post(
    "/api/v1/auth/register/client",
    json={
      "phone": phone,
      "code": code,
      "name": name,
      "acceptedTerms": True,
      "acceptedPrivacy": True,
    },
  )
  assert response.status_code == 200
  token = response.json()["token"]
  return {"Authorization": f"Bearer {token}"}


def _onboard_lawyer(client: TestClient, phone: str = "13900008888") -> dict[str, str]:
  code = _request_code(client, phone)
  response = client.post(
    "/api/v1/auth/onboard-lawyer",
    json={
      "phone": phone,
      "code": code,
      "name": "赵律师",
      "lawFirm": "北京中正律师事务所",
      "licenseNumber": "11101202010123456",
      "practiceRegion": "北京",
      "specialties": ["合同纠纷", "债务催收"],
      "acceptedTerms": True,
      "acceptedPrivacy": True,
    },
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


def _create_case(client: TestClient, headers: dict[str, str]) -> str:
  created = client.post(
    "/api/v1/cases",
    headers=headers,
    json={
      "debtorName": "北京YY贸易有限公司",
      "contactName": "李女士",
      "contactPhone": "13900001111",
      "amount": 52300,
      "contractDate": "2024-05-02",
      "dispute": "对方确认收货后长期拖欠尾款，已有多次书面催收记录。",
      "dueStatus": "已到期",
    },
  )
  assert created.status_code == 201
  law_case = created.json()["case"]
  case_id = law_case["id"]
  assert law_case["status"] == "待补充证据"
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
