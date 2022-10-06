# cloudflare-worker-token-service

Use cloudflare-worker-token-service in place of an OAUTH 2.0 token endpoint. Secret keys are stored as environment variables and token urls are stored in the TOKEN_URLS kv namespace.

## Example

With VARIABLE_NAME = `CLIENT_ID` and Value = `SECRET_KEY` in environment variables and key = `CLIENT_ID` and value = `https://oauth2.googleapis.com/token` in the TOKEN_URLS KV Namespace.

```js
const WORKER_URL =
  "https://cloudflare-worker-token-service.example.workers.dev";
const url = new URL(`${WORKER_URL}/token`); // Instead of https://oauth2.googleapis.com/token
url.searchParams.append("client_id", "CLIENT_ID");
url.searchParams.append("response_type", "code");
url.searchParams.append("grant_type", "authorization_code");
url.searchParams.append("redirect_uri", REDIRECT_URI);
url.searchParams.append("code", CODE);
// client_secret isn't set here and instead set in the workers environment variables
```

## Available Grant Types:

`refresh_token`

`authorization_code`
