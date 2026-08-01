# ことば推理ゲーム（オンラインテスト版）

Vercelへデプロイする静的フロントエンドと `api/game.js` で構成している。

## Vercel KVの接続

Vercel MarketplaceでUpstash RedisなどのKVストアをプロジェクトへ接続し、`KV_REST_API_URL` と `KV_REST_API_TOKEN` を環境変数に設定する。未設定時はVercel Functionのメモリだけで動くため、複数インスタンス・再起動をまたぐテストには使えない。

秘密単語、手札、参加トークンはサーバーのルーム状態にだけ保存し、`GET /api/game` は参加トークンに対応するプレイヤーの手札だけを返す。
