from app.schemas import AssessmentJob
from app.store import AppStore


def start_case_assessment(store: AppStore, user_id: str, case_id: str) -> AssessmentJob | None:
  return store.start_case_assessment(user_id, case_id)
