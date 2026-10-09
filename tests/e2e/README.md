# End-to-end tests

The browser E2E suite lives in `scripts/e2e/run.mjs` and is started with:

```sh
npm run e2e
```

It brings up a real Roundcube + GreenMail stack via
[`docker-compose.yml`](docker-compose.yml), builds the `e2e` extension variant,
and drives Chromium with the extension loaded. Results and screenshots are
written to `tests/e2e/artifacts/` (git-ignored).

See [`docs/TESTING.md`](../../docs/TESTING.md) for details and
[`docs/COMPATIBILITY.md`](../../docs/COMPATIBILITY.md) for the validated matrix.

The stack uses **synthetic accounts and messages only**.
