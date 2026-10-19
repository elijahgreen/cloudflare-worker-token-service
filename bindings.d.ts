interface Variables {
  [K: string]: string;
}

type Bindings = Variables & {
  TOKEN_URLS: KVNamespace;
  CLIENT_CREDENTIALS_LIMITER: RateLimit;
};
