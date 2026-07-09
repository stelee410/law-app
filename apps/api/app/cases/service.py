from app.schemas import CreateCaseInput, LawCase, LawyerServiceActionInput, PlanId, SelfServiceActionInput
from app.store import AppStore


def list_cases(store: AppStore, user_id: str) -> list[LawCase]:
  return store.list_cases(user_id)


def create_case(store: AppStore, user_id: str, payload: CreateCaseInput) -> LawCase:
  return store.create_case(user_id, payload)


def get_case(store: AppStore, user_id: str, case_id: str) -> LawCase | None:
  return store.get_case(user_id, case_id)


def select_plan(store: AppStore, user_id: str, case_id: str, plan_id: PlanId) -> LawCase | None:
  return store.select_plan(user_id, case_id, plan_id)


def record_self_service_action(
  store: AppStore,
  user_id: str,
  case_id: str,
  input_data: SelfServiceActionInput,
) -> LawCase | None:
  return store.record_self_service_action(user_id, case_id, input_data)


def record_lawyer_service_action(
  store: AppStore,
  user_id: str,
  case_id: str,
  input_data: LawyerServiceActionInput,
) -> LawCase | None:
  return store.record_lawyer_service_action(user_id, case_id, input_data)
