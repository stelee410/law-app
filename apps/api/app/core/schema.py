from app.core.database import Database


def initialize_schema(database: Database) -> None:
  statements = [
    """
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'client',
      created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS otp_codes (
      phone TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      case_type TEXT NOT NULL DEFAULT 'debt_collection',
      debtor_name TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      contract_date TEXT NOT NULL,
      dispute TEXT NOT NULL,
      due_status TEXT NOT NULL,
      party_role TEXT NOT NULL DEFAULT '',
      counterparty_name TEXT NOT NULL DEFAULT '',
      region TEXT NOT NULL DEFAULT '',
      incident_date TEXT NOT NULL DEFAULT '',
      claim_type TEXT NOT NULL DEFAULT '',
      claim_summary TEXT NOT NULL DEFAULT '',
      privacy_consent BOOLEAN NOT NULL DEFAULT TRUE,
      matter_fields_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      case_no TEXT NOT NULL,
      selected_plan TEXT,
      assessment_json JSONB,
      stages_json JSONB NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS evidence_files (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL,
      name TEXT NOT NULL,
      size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      uploaded_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS assessment_jobs (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      result_json JSONB,
      error_code TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS case_events (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      payload JSONB NOT NULL,
      created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS work_items (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      due_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS review_opinions (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
      lawyer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      conclusion TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      evidence_gaps_json JSONB NOT NULL,
      advice TEXT NOT NULL,
      next_action TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS legal_documents (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      title TEXT NOT NULL,
      fields_json JSONB NOT NULL,
      body TEXT NOT NULL,
      version INTEGER NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      updated_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS notification_messages (
      id TEXT PRIMARY KEY,
      recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      case_id TEXT REFERENCES cases(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      unread BOOLEAN NOT NULL,
      action_href TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
    """,
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'client'",
    "ALTER TABLE cases ADD COLUMN IF NOT EXISTS case_type TEXT NOT NULL DEFAULT 'debt_collection'",
    "ALTER TABLE cases ADD COLUMN IF NOT EXISTS party_role TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE cases ADD COLUMN IF NOT EXISTS counterparty_name TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE cases ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE cases ADD COLUMN IF NOT EXISTS incident_date TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE cases ADD COLUMN IF NOT EXISTS claim_type TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE cases ADD COLUMN IF NOT EXISTS claim_summary TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE cases ADD COLUMN IF NOT EXISTS privacy_consent BOOLEAN NOT NULL DEFAULT TRUE",
    "ALTER TABLE cases ADD COLUMN IF NOT EXISTS matter_fields_json JSONB NOT NULL DEFAULT '{}'::jsonb",
    "CREATE INDEX IF NOT EXISTS idx_cases_user_created ON cases(user_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_evidence_case ON evidence_files(case_id)",
    "CREATE INDEX IF NOT EXISTS idx_events_case_created ON case_events(case_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_work_items_case ON work_items(case_id)",
    "CREATE INDEX IF NOT EXISTS idx_work_items_assignee ON work_items(assignee_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_documents_case ON legal_documents(case_id, updated_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_messages_recipient ON notification_messages(recipient_user_id, created_at DESC)",
  ]
  with database.connection() as conn:
    with conn.cursor() as cursor:
      for statement in statements:
        cursor.execute(statement)
    conn.commit()
