# PostgreSQL移行（SQLiteモックDB廃止） — design

## Context

`db/schema.sql` および `docs/database-auth-design.md` で、本アプリのDBMSは
**PostgreSQL** と決定済みだった（理由：予約の二重登録防止に
`tsrange` + `EXCLUDE USING gist` 制約を使うため）。しかし実装は
Tech Jam向けプロトタイプという位置づけから、本番用PostgreSQLを用意せず
`node:sqlite`（Node組み込み・実験的機能）でのローカルSQLiteをスタンド
インとして使ってきた（`mock-db/mock_directory.sqlite3`、
`mock-db/build_mock_directory.py`で生成）。

現在DBを直接使っている箇所は2つ：
- `src/lib/employees.ts` — ログイン認証（1クエリ）
- `src/lib/dashboard-data.ts` — 管理者向け利用率ダッシュボード（`admin`
  ブランチで実装済み、未コミット。動的WHERE句組み立てや期間バケット
  ごとの集計など、生SQL文字列を多用する20以上の関数群）

この設計では、決定済みの本番想定に合わせて実際にPostgreSQLを用意し、
上記2箇所を含め全面的に移行する。移行対象は接続層・クエリ・シード
スクリプトのみで、予約作成などの新機能追加は含まない。

既存のSQLiteファイル・その中のデータはすべて仮データであり、移行後は
不要になるため保持せず削除する。

## 1. インフラ構成

- **`docker-compose.yml`** を新規作成し、`postgres:16`コンテナを1つ定義。
  ボリュームでデータ永続化、ポート`5432`をローカルに公開。
- **接続情報**：`.env.local`（`.env.example`にひな形追加）に
  `DATABASE_URL=postgres://massaman:massaman@localhost:5432/massaman`
  形式で1本化。
- SQLite用の `NODE_OPTIONS=--experimental-sqlite` は `package.json` の
  `dev`/`build`/`start` スクリプトから削除。
- **Drizzle接続ドライバ**：`drizzle-orm/postgres-js`（`postgres`パッケージ）
  を採用。Next.jsのHMR環境でも扱いやすく、コネクションプールの扱いが
  シンプルなため。
- `src/lib/db.ts` はグローバルシングルトン化する（Next.jsの開発時ホット
  リロードで接続が増殖しないよう、`globalThis`にキャッシュする定番
  パターン）。エクスポートする`db`は非同期APIになる。

## 2. スキーマ・マイグレーション

- **スキーマ定義の正本（source of truth）は `src/db/schema.ts`（Drizzle TSスキーマ）に移す**。
  `db/schema.sql`のテーブル定義（`departments`/`users`/
  `therapist_profiles`/`therapist_shifts`/`therapist_breaks`/`rooms`/
  `reservations`/`reviews`/`notification_settings`）をすべてTSで
  書き直す。
- **`drizzle-kit generate`** で通常のテーブル・インデックス・外部キーの
  マイグレーションSQLを自動生成する。
- **例外：二重予約防止の `EXCLUDE USING gist` 制約**（Drizzleの標準機能
  では表現不可）は、生成された`reservations`テーブルの初回マイグレー
  ションファイルに対して、`CREATE EXTENSION btree_gist;`と2本の
  `EXCLUDE`制約を**手書きSQLとして追記**する一回限りの処理として扱う
  （`docs/database-auth-design.md` §2.4のSQLをそのまま流用）。以後
  スキーマを変更するときは通常どおりTSを直してgenerateするだけで、
  この手書き部分は変更がない限り触らない。
- `db/schema.sql`自体は「設計の記録」として残すが、実装上の正本は
  `src/db/schema.ts`である旨をコメントまたはREADMEに明記する。

## 3. データアクセス層の書き直し

- **`src/lib/db.ts`**：`DatabaseSync`（同期・読み取り専用）を廃止し、
  `drizzle-orm/postgres-js`の`db`インスタンス（非同期）をエクスポート。
- **`src/lib/employees.ts`**：`findEmployeeByCode`をDrizzleのクエリ
  ビルダ（`db.select().from(users).where(eq(users.employeeCode, id))`）
  で書き直す。戻り値の型は`schema.ts`の推論型から取る。関数を`async`化
  し、呼び出し元（`src/app/actions/auth.ts`、`src/lib/dal.ts`）にも
  `await`を追加。
- **`src/lib/dashboard-data.ts`**：全関数を`async`化。各関数内の生SQL
  文字列は`db.execute(sql\`...\`)`に置き換え、`?`プレースホルダを
  `${変数}`のsql``補間に変換する（Drizzleが自動でパラメータ化するので
  SQLインジェクションの心配はない）。`attributeWhere()`が返す
  `{clause, params}`構造は、`sql`テンプレートの動的結合に置き換える。
  占有率/実人数比の切替、属性別分解式などのロジック自体は一切変更しない
  ——これは既に複数ラウンドの手動検証を経て正しさが確認済みのため、
  今回はSQL実行方式の移植のみに専念し、計算ロジックの書き換えは行わない。

## 4. シードスクリプト

- **`mock-db/build_mock_directory.py`は削除**。代わりに`src/db/seed.ts`
  を新規作成し、`build_mock_directory.py`の生成ロジック（
  `HOUR_WEIGHT`需要曲線、`THERAPIST_SHIFTS`設定、52週分の履歴＋今週分、
  部署・年代・性別の分布など）をTypeScriptに移植する。
- パスワードハッシュは既存依存の`bcryptjs`をそのまま使用する（Python版
  `bcrypt`は不要になる）。テストアカウント表（社員ID・氏名・ロール・
  部署・共通パスワード）は変更しない。
- 実行コマンドは`pnpm db:seed`として`package.json`に追加。中身は
  テーブルをTRUNCATEしてから全件INSERTし直す、現行と同じ「毎回作り
  直せる」シンプルな仕様を維持する。

## 5. 非同期化の波及範囲

- 現状`getOverallStats`等はNext.jsのServer Component内で同期呼び出し
  されているため、呼び出し側に`await`を追加するだけで済む（Server
  Component自体は元々`async function`なので構造変更は不要）。
- 影響ファイル：`src/app/(admin)/dashboard/page.tsx`、
  `src/app/(admin)/dashboard/[therapistId]/page.tsx`、
  `src/app/actions/auth.ts`、`src/lib/dal.ts`。
- `page.tsx`内で直接`db.prepare(...).all()`していた箇所（部署ロスター
  取得など）も`await db.execute(...)`に統一する。

## 6. 後片付け

- `mock-db/`ディレクトリ（`build_mock_directory.py`・
  `mock_directory.sqlite3`・`test-credentials.md`）を削除。
  `test-credentials.md`の内容（テストアカウント表・共通パスワード）は
  `docs/database-auth-design.md` §5に統合し、参照先を一本化する。
- `package.json`：`drizzle-orm`・`postgres`・`drizzle-kit`を依存に追加。
  Python版`bcrypt`に関する記述をREADME等から削除。
  `NODE_OPTIONS=--experimental-sqlite`を`dev`/`build`/`start`
  スクリプトから除去。
- `CLAUDE.md`の「Implementation architecture」節（`db.ts`が
  `node:sqlite`経由と書いてある箇所）と、`docs/database-auth-design.md`
  （PostgreSQLは「決定事項」だが実体はSQLiteだった旨の記述）を実態に
  合わせて更新する。

## 7. 検証方法

- `docker compose up -d` → `drizzle-kit generate && drizzle-kit migrate`
  → `pnpm db:seed` → `pnpm dev` の一連の手順で、クリーンな状態から
  起動できることを確認する。
- 認証：既存8テストアカウント全員でログイン成功を確認する。
- ダッシュボード：admin/dashboardと個人ビューを実際にブラウザで開き、
  これまで検証してきた数値（全体利用率・属性別分解・空き時間など）が
  SQLite版と同じ計算結果になることを確認する（シード時の乱数シードと
  ロジックを保っているため、数値自体はほぼ一致するはず。UUIDのみ生成
  のたびに変わる想定は現状と同じ）。
- `tsc --noEmit` / `pnpm lint` / `pnpm build` を通す。

## Out of scope

- 予約作成・キャンセル等、実際にDBへ書き込む新機能の実装
  （booking/schedule機能自体はissue #5–#12として別途扱う）。
- 本番デプロイ環境（マネージドPostgres等）へのプロビジョニング。
  このdesignはローカル開発環境（Docker Compose）のみを対象とする。
