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


def _login(client: TestClient) -> dict[str, str]:
  code_response = client.post("/api/v1/auth/request-code", json={"phone": "13800001234"})
  assert code_response.status_code == 200
  assert code_response.json()["mockCode"] == "654321"

  login_response = client.post(
    "/api/v1/auth/login",
    json={"phone": "13800001234", "code": code_response.json()["mockCode"]},
  )
  assert login_response.status_code == 200
  token = login_response.json()["token"]
  headers = {"Authorization": f"Bearer {token}"}

  me_response = client.get("/api/v1/me", headers=headers)
  assert me_response.status_code == 200
  assert me_response.json()["user"]["phone"] == "13800001234"
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
