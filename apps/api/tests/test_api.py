import os

os.environ["STORAGE_BACKEND"] = "memory"
os.environ["OPENAI_API_BASE"] = ""
os.environ["OPENAI_API_KEY"] = ""
os.environ["DEFAULT_LLM_MODEL"] = ""

from fastapi.testclient import TestClient

from app import store as store_module
from app.core.config import Settings
from app.main import create_app


def _test_settings() -> Settings:
  return Settings(
    MOCK_OTP_CODE="654321",
    STORAGE_BACKEND="memory",
    OPENAI_API_BASE=None,
    OPENAI_API_KEY=None,
    DEFAULT_LLM_MODEL=None,
  )


def test_minimal_case_workflow() -> None:
  client = TestClient(create_app(_test_settings()))
  headers = _login(client)
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


def test_plan_selection_is_idempotent_and_rejects_switching() -> None:
  client = TestClient(create_app(_test_settings()))
  client_headers = _login(client, phone="13800001234")
  lawyer_headers = _login(client, phone="13900009999")
  case_id = _create_case(client, client_headers)
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
  client_headers = _login(client, phone="13800001234")
  lawyer_headers = _login(client, phone="13900009999")
  case_id = _create_case(client, client_headers)

  upload = client.post(
    f"/api/v1/cases/{case_id}/evidence/contract",
    headers=client_headers,
    files={"file": ("contract.pdf", b"contract bytes", "application/pdf")},
  )
  assert upload.status_code == 200
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


def test_assessment_failure_is_recorded_as_event(monkeypatch) -> None:
  client = TestClient(create_app(_test_settings()))
  headers = _login(client)
  case_id = _create_case(client, headers)

  def fail_assessment(_law_case):
    raise RuntimeError("workflow unavailable")

  monkeypatch.setattr(store_module, "assess_case", fail_assessment)

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


def _login(client: TestClient, phone: str = "13800001234") -> dict[str, str]:
  code_response = client.post("/api/v1/auth/request-code", json={"phone": phone})
  assert code_response.status_code == 200
  assert code_response.json()["mockCode"] == "654321"

  login_response = client.post(
    "/api/v1/auth/login",
    json={"phone": phone, "code": code_response.json()["mockCode"]},
  )
  assert login_response.status_code == 200
  token = login_response.json()["token"]
  headers = {"Authorization": f"Bearer {token}"}

  me_response = client.get("/api/v1/me", headers=headers)
  assert me_response.status_code == 200
  assert me_response.json()["user"]["phone"] == phone
  return headers


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
