from urllib.parse import parse_qs, urlsplit

from fastapi.testclient import TestClient

from app.auth import sms
from app.core.config import Settings
from app.main import create_app


def _settings(**overrides) -> Settings:
  values = {
    "STORAGE_BACKEND": "memory",
    "SMS_ENABLED": True,
    "SMS_PROVIDER": "aliyun",
    "ALIYUN_SMS_ACCESS_KEY_ID": "test-id",
    "ALIYUN_SMS_ACCESS_KEY_SECRET": "test-secret",
    "ALIYUN_SMS_SIGN_NAME": "法灵 AI",
    "ALIYUN_SMS_TEMPLATE_LOGIN": "SMS_LOGIN",
    "ALIYUN_SMS_TEMPLATE_REGISTER": "SMS_REGISTER",
  }
  values.update(overrides)
  return Settings(**values)


def test_aliyun_sender_signs_login_request_without_exposing_code(monkeypatch) -> None:
  requested_url = ""

  class FakeResponse:
    status_code = 200

    @staticmethod
    def json():
      return {"Code": "OK", "RequestId": "request-test"}

  def fake_get(url: str, **_kwargs):
    nonlocal requested_url
    requested_url = url
    return FakeResponse()

  monkeypatch.setattr(sms.httpx, "get", fake_get)
  settings = _settings()
  client = TestClient(create_app(settings))

  response = client.post(
    "/api/v1/auth/request-code",
    json={"phone": "13800001234", "purpose": "login"},
  )

  assert response.status_code == 200
  assert "mockCode" not in response.json()
  query = parse_qs(urlsplit(requested_url).query)
  assert query["Action"] == ["SendSms"]
  assert query["PhoneNumbers"] == ["13800001234"]
  assert query["TemplateCode"] == ["SMS_LOGIN"]
  assert query["SignName"] == ["法灵 AI"]
  assert query["Signature"]


def test_aliyun_sender_selects_register_template(monkeypatch) -> None:
  requested_url = ""

  class FakeResponse:
    status_code = 200

    @staticmethod
    def json():
      return {"Code": "OK", "RequestId": "request-test"}

  def fake_get(url: str, **_kwargs):
    nonlocal requested_url
    requested_url = url
    return FakeResponse()

  monkeypatch.setattr(sms.httpx, "get", fake_get)

  sms.send_verification_code(_settings(), "13800001234", "register")

  query = parse_qs(urlsplit(requested_url).query)
  assert query["TemplateCode"] == ["SMS_REGISTER"]


def test_sms_disabled_returns_configuration_error() -> None:
  client = TestClient(create_app(_settings(SMS_ENABLED=False)))

  response = client.post(
    "/api/v1/auth/request-code",
    json={"phone": "13800001234", "purpose": "login"},
  )

  assert response.status_code == 503
  assert response.json()["detail"] == "SMS_NOT_CONFIGURED"


def test_repeated_sms_request_is_rate_limited() -> None:
  client = TestClient(create_app(_settings(SMS_PROVIDER="mock")))
  payload = {"phone": "13800001234", "purpose": "login"}

  first = client.post("/api/v1/auth/request-code", json=payload)
  repeated = client.post("/api/v1/auth/request-code", json=payload)

  assert first.status_code == 200
  assert repeated.status_code == 429
  assert repeated.json()["detail"] == "SMS_TOO_FREQUENT"

def test_duration_aliases_match_deployment_configuration() -> None:
  settings = _settings(
    SMS_CODE_TTL="5m",
    SMS_SEND_COOLDOWN="60s",
    ALIYUN_SMS_REQUEST_TIMEOUT="5s",
  )

  assert settings.OTP_EXPIRE_MINUTES == 5
  assert settings.SMS_SEND_COOLDOWN_SECONDS == 60
  assert settings.ALIYUN_SMS_REQUEST_TIMEOUT_SECONDS == 5


def test_verification_code_attempt_limit_and_single_use() -> None:
  settings = _settings(
    SMS_PROVIDER="mock",
    MOCK_OTP_CODE="654321",
    SMS_SEND_COOLDOWN="0s",
    SMS_MAX_ATTEMPTS=5,
  )
  client = TestClient(create_app(settings))
  phone = "13800001234"

  register_code = client.post(
    "/api/v1/auth/request-code",
    json={"phone": phone, "purpose": "register"},
  ).json()["mockCode"]
  registered = client.post(
    "/api/v1/auth/register/client",
    json={
      "phone": phone,
      "code": register_code,
      "name": "测试用户",
      "acceptedTerms": True,
      "acceptedPrivacy": True,
    },
  )
  assert registered.status_code == 200

  login_code = client.post(
    "/api/v1/auth/request-code",
    json={"phone": phone, "purpose": "login"},
  ).json()["mockCode"]
  for _ in range(settings.SMS_MAX_ATTEMPTS):
    rejected = client.post("/api/v1/auth/login", json={"phone": phone, "code": "000000"})
    assert rejected.status_code == 401
  exhausted = client.post("/api/v1/auth/login", json={"phone": phone, "code": login_code})
  assert exhausted.status_code == 401

  refreshed_code = client.post(
    "/api/v1/auth/request-code",
    json={"phone": phone, "purpose": "login"},
  ).json()["mockCode"]
  logged_in = client.post("/api/v1/auth/login", json={"phone": phone, "code": refreshed_code})
  assert logged_in.status_code == 200
  reused = client.post("/api/v1/auth/login", json={"phone": phone, "code": refreshed_code})
  assert reused.status_code == 401

def test_aliyun_rpc_params_are_sorted_and_percent_encoded() -> None:
  encoded = sms._encode_aliyun_rpc_params(
    {
      "TemplateParam": '{"code":"123456"}',
      "SignName": "法灵 AI",
      "Action": "SendSms",
    }
  )

  assert encoded.startswith("Action=SendSms&SignName=")
  assert "TemplateParam=%7B%22code%22%3A%22123456%22%7D" in encoded
  assert "+" not in encoded
