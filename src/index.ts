interface Variables {
  [K: string]: string;
}

type Env = Variables & {
  TOKEN_URLS: KVNamespace;
};

async function authorization(
  tokenUrl: string,
  clientId: string,
  code: string,
  redirectUri: string,
  clientSecret: string
) {
  const params = new URLSearchParams();
  params.append("grant_type", "authorization_code");
  params.append("code", code);
  params.append("redirect_uri", redirectUri);
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);

  const response = await fetch(tokenUrl, {
    method: "POST",
    body: params.toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  const newResponse = new Response(response.body, response);
  newResponse.headers.set("Access-Control-Allow-Origin", "*");
  return newResponse;
}

async function refresh(
  tokenUrl: string,
  clientId: string,
  refreshToken: string,
  clientSecret: string
) {
  const params = new URLSearchParams();
  params.append("grant_type", "refresh_token");
  params.append("refresh_token", refreshToken);
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);

  const response = await fetch(tokenUrl, {
    method: "POST",
    body: params.toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  const newResponse = new Response(response.body, response);
  newResponse.headers.set("Access-Control-Allow-Origin", "*");
  return newResponse;
}

function getError(errorCode: number, errorMessage: string | null) {
  return new Response(errorMessage, {
    status: errorCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
        },
      });
    } else if (request.method === "POST") {
      const contentType = request.headers.get("content-type");
      if (contentType !== "application/x-www-form-urlencoded") {
        return getError(415, null);
      }

      const url = new URL(request.url);
      const body = await request.text();
      const params = new URLSearchParams(body);
      const clientId = params.get("client_id");
      const grantType = params.get("grant_type");

      if (!grantType) {
        return getError(400, "'grant_type' not found");
      }

      if (!clientId) {
        return getError(400, "'client_id' not found");
      }
      const tokenUrl = await env.TOKEN_URLS.get(clientId);
      if (!tokenUrl) {
        return getError(400, `'client_id' ${clientId} tokenUrl not found`);
      }

      const secret = env[clientId];
      if (!secret) {
        return getError(400, `'client_id' ${clientId} secret not found`);
      }

      if (url.pathname === "/token") {
        if (grantType === "refresh_token") {
          const refreshToken = params.get("refresh_token");
          if (!refreshToken) {
            return getError(400, `'refresh_token' not found`);
          }

          return refresh(tokenUrl, clientId, refreshToken, secret);
        } else if (grantType === "authorization_code") {
          const redirectUri = params.get("redirect_uri");
          if (!redirectUri) {
            return getError(400, `'redirect_uri' not found`);
          }

          const code = params.get("code");
          if (!code) {
            return getError(400, `'code' not found`);
          }
          return authorization(tokenUrl, clientId, code, redirectUri, secret);
        } else {
          return getError(400, `'grant_type' ${grantType} is invalid`);
        }
      } else {
        return getError(404, null);
      }
    } else {
      return new Response("Hello World!");
    }
  },
};
