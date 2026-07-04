# Connecting Novalux to Facebook Messenger & Instagram

The chatbot answers Messenger and Instagram DMs using the same AI brain as the on-site
widget. Both run on Meta's Messenger Platform, so one Meta app covers both. This guide is
the external setup — the code is already built.

## 1. Generate the token-encryption key

Store owners' Facebook page tokens are encrypted at rest. Generate a key:

```
openssl rand -base64 32
```

Put the result in `TOKEN_ENC_KEY` (in `.env.local` and on your host).

## 2. Create the Meta app

1. Go to https://developers.facebook.com → **My Apps** → **Create App** → type **Business**.
2. Add the **Messenger** and **Instagram** products.
3. Copy the App ID / App Secret into your env:
   - `META_APP_ID` and `NEXT_PUBLIC_META_APP_ID` = the App ID
   - `META_APP_SECRET` = the App Secret
4. Choose any string for `META_VERIFY_TOKEN` (e.g. `openssl rand -hex 16`).

## 3. Configure the webhook

- **Callback URL:** `https://<your-deployed-domain>/api/webhooks/meta`
- **Verify token:** your `META_VERIFY_TOKEN`
- **Subscribe to fields:** `messages`, `messaging_postbacks` (Messenger) and the Instagram
  `messages` field.
- Meta cannot reach `localhost`. For local testing, run a public HTTPS tunnel to port 3000
  and use that URL as the callback.

The `GET /api/webhooks/meta` handshake echoes `hub.challenge` when the verify token matches.

## 4. Apply the database migration

Run `Database/015_channel_connections.sql` in the Supabase SQL editor. It creates the
`channel_connections` table (service-role only) and widens the `orders.source` CHECK
constraint to allow `messenger` / `instagram`.

## 5. Test in Development mode (no App Review needed)

- Under **App Roles**, add yourself as Admin / Developer / Tester.
- Connect your own Facebook Page (linked to an Instagram professional account) from
  Novalux → **Dashboard → Paramètres → Chatbot → "Connecter Facebook / Instagram"**.
- DM your Page on Messenger and your IG account — the chatbot should reply.

Requires an **Ultimate** plan (or a store with a chatbot daily limit) — the connection card
is gated the same as the chatbot.

## 6. Go live (App Review)

Required only to let *other* store owners connect their pages:

- Complete **Business Verification**.
- Submit for **App Review** requesting `pages_messaging` and `instagram_manage_messages`
  (plus `pages_show_list`, `pages_manage_metadata`, `instagram_basic`, `business_management`),
  with a privacy-policy URL and a screen recording of the connect + reply flow.

## Notes

- The daily message limit is **shared** across the web widget, Messenger, and Instagram
  (one `chatbot_daily_usage` counter per store), so DMs and on-site chats draw from the
  same quota.
- Page access tokens are stored encrypted (`TOKEN_ENC_KEY`) and never exposed to the browser.
