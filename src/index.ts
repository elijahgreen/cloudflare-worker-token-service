/**
 * Reddit throttles generic and spoofed browser user agents and asks API
 * clients for a descriptive one. Every other provider keeps the browser
 * string it has always been sent.
 */
function userAgentFor(tokenUrl: string) {
  if (new URL(tokenUrl).hostname.endsWith("reddit.com")) {
    return "web:socialgata:1.0 (by /u/elijgreen)";
  }
  return "Mozilla/5.0 (X11; CrOS x86_64 8172.45.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.64 Safari/537.36";
}

async function makeRequest(
  tokenUrl: string,
  params: URLSearchParams,
  clientId: string,
  clientSecret: string,
  basic: boolean
) {
  const headers = new Headers();
  headers.set("Content-Type", "application/x-www-form-urlencoded");
  headers.set("User-Agent", userAgentFor(tokenUrl));
  if (basic) {
    const base64 = btoa(`${clientId}:${clientSecret}`);
    headers.set("Authorization", `Basic ${base64}`);
  } else {
    params.append("client_id", clientId);
    params.append("client_secret", clientSecret);
  }

  const send = () =>
    fetch(tokenUrl, {
      method: "POST",
      body: params.toString(),
      headers: headers,
    });
  let response = await send();
  // Reddit intermittently answers 429 with "Retry-After: 0" from Cloudflare's
  // shared egress; asking again straight away usually gets a token.
  if (
    response.status === 429 &&
    Number(response.headers.get("Retry-After") ?? 0) === 0
  ) {
    response = await send();
  }

  const newResponse = new Response(response.body, response);
  newResponse.headers.set("Access-Control-Allow-Origin", "*");
  return newResponse;
}

async function authorization(
  tokenUrl: string,
  clientId: string,
  code: string,
  redirectUri: string,
  clientSecret: string,
  basic: boolean
) {
  const params = new URLSearchParams();
  params.append("grant_type", "authorization_code");
  params.append("code", code);
  params.append("redirect_uri", redirectUri);

  return makeRequest(tokenUrl, params, clientId, clientSecret, basic);
}

async function refresh(
  tokenUrl: string,
  clientId: string,
  refreshToken: string,
  clientSecret: string,
  basic: boolean
) {
  const params = new URLSearchParams();
  params.append("grant_type", "refresh_token");
  params.append("refresh_token", refreshToken);

  return makeRequest(tokenUrl, params, clientId, clientSecret, basic);
}

async function clientCredentials(
  tokenUrl: string,
  clientId: string,
  clientSecret: string,
  basic: boolean
) {
  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");

  return makeRequest(tokenUrl, params, clientId, clientSecret, basic);
}

function getError(errorCode: number, errorMessage: string | null) {
  return new Response(errorMessage, {
    status: errorCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  });
}

async function handleToken(request: Request, env: Bindings): Promise<Response> {
  const body = await request.text();
  const params = new URLSearchParams(body);
  const clientId = params.get("client_id");
  const grantType = params.get("grant_type");

  const requestUrl = new URL(request.url);
  const basic = requestUrl.searchParams.has("basic");

  if (!grantType) {
    return getError(400, "'grant_type' not found");
  }

  if (!clientId) {
    return getError(400, "'client_id' not found");
  }
  const tokenUrl = await env.TOKEN_URLS.get(clientId);
  if (!tokenUrl) {
    return getError(400, `'client_id' ${clientId} token url not found`);
  }

  const secret = env[clientId];
  if (!secret) {
    return getError(400, `'client_id' ${clientId} secret not found`);
  }
  if (grantType === "refresh_token") {
    const refreshToken = params.get("refresh_token");
    if (!refreshToken) {
      return getError(400, `'refresh_token' not found`);
    }

    return refresh(tokenUrl, clientId, refreshToken, secret, basic);
  } else if (grantType === "authorization_code") {
    const redirectUri = params.get("redirect_uri");
    if (!redirectUri) {
      return getError(400, `'redirect_uri' not found`);
    }

    const code = params.get("code");
    if (!code) {
      return getError(400, `'code' not found`);
    }
    return authorization(tokenUrl, clientId, code, redirectUri, secret, basic);
  } else if (grantType === "client_credentials") {
    // The only grant that needs nothing from a user, so anyone can mint app
    // tokens with it and spend the app's quota at the provider. Limited per
    // client and per caller, so one app's traffic can't use up another's.
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const { success } = await env.CLIENT_CREDENTIALS_LIMITER.limit({
      key: `${clientId}:${ip}`,
    });
    if (!success) {
      // No IP: the client id and user agent are enough to tell a stuck app
      // from a scraper.
      console.warn({
        event: "client_credentials_rate_limited",
        clientId,
        userAgent: request.headers.get("User-Agent"),
        origin: request.headers.get("Origin"),
      });
      const response = getError(429, "Too many client_credentials requests");
      response.headers.set("Retry-After", "60");
      // Not CORS-safelisted, so a browser caller can't back off without this.
      response.headers.set("Access-Control-Expose-Headers", "Retry-After");
      return response;
    }
    return clientCredentials(tokenUrl, clientId, secret, basic);
  } else {
    return getError(400, `'grant_type' ${grantType} is invalid`);
  }
}

export default {
  async fetch(request: Request, env: Bindings): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type, Client-Id",
        },
      });
    } else if (request.method === "POST") {
      if (url.pathname === "/token") {
        const contentType = request.headers.get("content-type");
        if (contentType !== "application/x-www-form-urlencoded") {
          return getError(415, null);
        }

        return handleToken(request, env);
      } else {
        return getError(404, null);
      }
    } else {
      return new Response(
        "cloudflare-worker-token-service\n\n" +
          "Usage:\n" +
          url.origin +
          "/token",
        {
          status: 200,
        }
      );
    }
  },
};
