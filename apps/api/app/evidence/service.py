from pathlib import Path

from fastapi import UploadFile

from app.schemas import EvidenceFile
from app.store import AppStore


async def upload_evidence(
  store: AppStore,
  user_id: str,
  case_id: str,
  category_id: str,
  file: UploadFile,
) -> EvidenceFile | None:
  law_case = store.get_case(user_id, case_id)
  if law_case is None:
    return None
  category = next((item for item in law_case.evidence if item.id == category_id), None)
  if category is None:
    return None

  content = await file.read()
  file_name = Path(file.filename or "upload.bin").name
  upload_root = Path(store.settings.UPLOAD_DIR).resolve()
  target_dir = upload_root / law_case.id / category.id
  target_dir.mkdir(parents=True, exist_ok=True)
  target_path = target_dir / file_name
  target_path.write_bytes(content)
  storage_path = str(target_path.relative_to(upload_root))

  evidence_file = store.add_evidence_file(
    user_id,
    case_id,
    category_id,
    file_name,
    len(content),
    file.content_type or "application/octet-stream",
    storage_path,
  )
  if evidence_file is None:
    target_path.unlink(missing_ok=True)
  return evidence_file
