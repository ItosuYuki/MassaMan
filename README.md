# マッサマン(***Massa***ge ***Man***ager)

## 予約リマインド

- `pnpm dev`: Next.jsサーバーの起動中、30秒間隔で期限になったリマインドを確認します。
- Vercel: 開発用の定期実行は起動しません。Vercelの環境変数に16文字以上の`CRON_SECRET`を設定し、`GET /api/notifications/reminders`をVercel Cronから呼び出してください。
- Vercel Pro / Enterpriseで予約時刻に合わせて送る場合の推奨実行間隔は1分です。HobbyのVercel Cronは1日1回までのため、分単位のリマインドには外部のジョブランナーが必要です。
