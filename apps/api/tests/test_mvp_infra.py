from io import BytesIO
from pathlib import Path

import pytest
from fastapi import UploadFile

from app.core.config import Settings
from app.evidence import service as evidence_service
from app.evidence.service import upload_evidence
from app.schemas import AssessmentResult, CreateCaseInput
from app.store import InMemoryStore
from app.workflows.case_assessment import assess_case


def _memory_settings(**overrides):
  values = {
    "STORAGE_BACKEND": "memory",
    "OPENAI_API_BASE": None,
    "OPENAI_API_KEY": None,
    "DEFAULT_LLM_MODEL": None,
  }
  values.update(overrides)
  return Settings(**values)


def _create_demo_case(store: InMemoryStore):
  otp = store.request_login_code("13800001234")
  session = store.login_with_code("13800001234", otp["code"])
  assert session is not None
  law_case = store.create_case(
    session.user.id,
    CreateCaseInput(
      debtorName="海南演示科技有限公司",
      contactName="王经理",
      contactPhone="13900001111",
      amount=88600,
      contractDate="2026-06-20",
      dispute="对方确认收货后长期拖欠尾款，已有催收记录和送货凭证。",
      dueStatus="已到期",
    ),
  )
  return session, law_case


def test_settings_parses_mvp_infrastructure_fields(tmp_path: Path) -> None:
  settings = Settings(
    STORAGE_BACKEND="postgres",
    POSTGRES_HOST="192.168.200.131",
    POSTGRES_DB="postgres",
    POSTGRES_USER="postgres",
    POSTGRES_PORT=5432,
    POSTGRES_PASSWORD="secret",
    POSTGRES_POOL_SIZE=5,
    POSTGRES_MAX_OVERFLOW=10,
    JWT_SECRET_KEY="change-me",
    JWT_ALGORITHM="HS256",
    JWT_ACCESS_TOKEN_EXPIRE_DAYS=30,
    LOG_LEVEL="DEBUG",
    LOG_FORMAT="console",
    UPLOAD_DIR=str(tmp_path),
  )

  assert settings.STORAGE_BACKEND == "postgres"
  assert settings.POSTGRES_HOST == "192.168.200.131"
  assert settings.POSTGRES_PORT == 5432
  assert settings.POSTGRES_POOL_SIZE == 5
  assert settings.POSTGRES_MAX_OVERFLOW == 10
  assert settings.JWT_ACCESS_TOKEN_EXPIRE_DAYS == 30
  assert settings.TOKEN_EXPIRE_DAYS == 30
  assert settings.LOG_LEVEL == "DEBUG"
  assert settings.LOG_FORMAT == "console"
  assert settings.UPLOAD_DIR == str(tmp_path)
  assert settings.postgres_dsn.startswith("postgresql://postgres:")


@pytest.mark.anyio
async def test_upload_evidence_persists_file_to_upload_dir(tmp_path: Path) -> None:
  settings = _memory_settings(MOCK_OTP_CODE="654321", UPLOAD_DIR=str(tmp_path))
  store = InMemoryStore(settings)
  session, law_case = _create_demo_case(store)

  uploaded = await upload_evidence(
    store,
    session.user.id,
    law_case.id,
    "contract",
    UploadFile(filename="contract.txt", file=BytesIO(b"demo contract evidence")),
  )

  assert uploaded is not None
  persisted_files = list(tmp_path.rglob("*.txt"))
  assert len(persisted_files) == 1
  assert persisted_files[0].read_bytes() == b"demo contract evidence"


@pytest.mark.anyio
async def test_upload_evidence_keeps_duplicate_filenames_separate(tmp_path: Path) -> None:
  settings = _memory_settings(MOCK_OTP_CODE="654321", UPLOAD_DIR=str(tmp_path))
  store = InMemoryStore(settings)
  session, law_case = _create_demo_case(store)

  first = await upload_evidence(
    store,
    session.user.id,
    law_case.id,
    "contract",
    UploadFile(filename="contract.txt", file=BytesIO(b"first")),
  )
  second = await upload_evidence(
    store,
    session.user.id,
    law_case.id,
    "contract",
    UploadFile(filename="contract.txt", file=BytesIO(b"second")),
  )

  assert first is not None
  assert second is not None
  persisted_files = sorted(tmp_path.rglob("*.txt"))
  assert len(persisted_files) == 2
  assert sorted(file.read_bytes() for file in persisted_files) == [b"first", b"second"]


@pytest.mark.anyio
async def test_upload_evidence_rejects_unknown_category_without_writing(tmp_path: Path) -> None:
  settings = _memory_settings(MOCK_OTP_CODE="654321", UPLOAD_DIR=str(tmp_path))
  store = InMemoryStore(settings)
  session, law_case = _create_demo_case(store)

  uploaded = await upload_evidence(
    store,
    session.user.id,
    law_case.id,
    "unknown",
    UploadFile(filename="contract.txt", file=BytesIO(b"demo contract evidence")),
  )

  assert uploaded is None
  assert list(tmp_path.rglob("*")) == []


@pytest.mark.anyio
async def test_upload_evidence_rejects_oversized_file_without_writing(tmp_path: Path, monkeypatch) -> None:
  monkeypatch.setattr(evidence_service, "MAX_UPLOAD_BYTES", 8)
  settings = _memory_settings(MOCK_OTP_CODE="654321", UPLOAD_DIR=str(tmp_path))
  store = InMemoryStore(settings)
  session, law_case = _create_demo_case(store)

  with pytest.raises(evidence_service.EvidenceUploadError) as error:
    await upload_evidence(
      store,
      session.user.id,
      law_case.id,
      "contract",
      UploadFile(filename="contract.txt", file=BytesIO(b"too large")),
    )

  assert error.value.status_code == 413
  assert list(tmp_path.rglob("*")) == []


@pytest.mark.anyio
async def test_upload_evidence_rejects_unsupported_file_type_without_writing(tmp_path: Path) -> None:
  settings = _memory_settings(MOCK_OTP_CODE="654321", UPLOAD_DIR=str(tmp_path))
  store = InMemoryStore(settings)
  session, law_case = _create_demo_case(store)

  with pytest.raises(evidence_service.EvidenceUploadError) as error:
    await upload_evidence(
      store,
      session.user.id,
      law_case.id,
      "contract",
      UploadFile(filename="malware.exe", file=BytesIO(b"not allowed")),
    )

  assert error.value.status_code == 400
  assert list(tmp_path.rglob("*")) == []


def test_llm_assessment_failure_falls_back_to_deterministic_result(monkeypatch) -> None:
  settings = _memory_settings(
    OPENAI_API_BASE="http://127.0.0.1:1/v1",
    OPENAI_API_KEY="sk-test",
    DEFAULT_LLM_MODEL="test-model",
  )
  store = InMemoryStore(settings)
  _session, law_case = _create_demo_case(store)

  def fail_llm(*_args, **_kwargs):
    raise RuntimeError("llm unavailable")

  monkeypatch.setattr("app.workflows.llm.generate_assessment_with_llm", fail_llm)

  result = assess_case(law_case, settings)

  assert isinstance(result, AssessmentResult)
  assert result.winRate >= 60
