import argparse

from app.core.config import Settings
from app.main import create_store


def create_admin(phone: str, name: str) -> None:
  settings = Settings()
  store, database = create_store(settings)
  try:
    user = store.create_admin(phone, name)
    print(f"created admin {user.phone} {user.name}")
  finally:
    if database is not None:
      database.close()


def main() -> None:
  parser = argparse.ArgumentParser(prog="law-ai-api")
  subparsers = parser.add_subparsers(dest="command", required=True)

  create_admin_parser = subparsers.add_parser("create-admin")
  create_admin_parser.add_argument("--phone", required=True)
  create_admin_parser.add_argument("--name", required=True)

  args = parser.parse_args()
  if args.command == "create-admin":
    create_admin(args.phone, args.name)


if __name__ == "__main__":
  main()
