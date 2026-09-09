# Test credentials (mock-db)

Local test accounts seeded by `mock-db/build_mock_directory.py` into
`mock-db/mock_directory.sqlite3`. These are for local development only — do not
reuse this password anywhere real.

All 8 accounts share the same test password:

```
Passw0rd!
```

| 社員ID | 氏名 | ロール | 部署 |
|---|---|---|---|
| E1001 | 佐々木 美咲 | user（利用者） | 開発部 |
| E1002 | 山田 洋輔 | user（利用者） | 総務部 |
| E1003 | 高橋 直人 | user（利用者） | 営業部 |
| T2001 | 田中 仁 | therapist（マッサージ師） | ― |
| T2002 | 木村 健 | therapist（マッサージ師） | ― |
| T2003 | 高橋 大輔 | therapist（マッサージ師） | ― |
| T2004 | 佐藤 香 | therapist（マッサージ師） | ― |
| A3001 | 鈴木 一郎 | admin（管理者） | 総務部 |

Regenerate the database (e.g. after changing the seed data) with:

```bash
pip install bcrypt
python3 mock-db/build_mock_directory.py
```

The script re-creates `mock_directory.sqlite3` from scratch and re-runs the
bcrypt login verification for all 8 accounts, printing an OK/FAIL line per
account.
