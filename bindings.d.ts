interface Variables {
  [K: string]: string;
}

type Bindings = Variables & {
  TOKEN_URLS: KVNamespace;
};
