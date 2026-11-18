# Developer safeguards

This is a static browser application. Anything placed in client code, Vite-exposed environment variables or `public/` can be read by users. Never add secrets, private telemetry, access tokens, account credentials or deployment identifiers to those locations.

Keep local `.env` files untracked and do not upload them. If configuration is needed later, provide only harmless placeholders in `.env.example`. Review the actual staged files before committing; ignore rules do not remove previously tracked material.

Use the pinned lockfile with `npm ci`. Review dependency changes and their notices. Keep development and preview servers on localhost unless sharing is intentional. This handoff contains no production deployment connection or credentials.

Propose changes through branches and pull requests as a team convention; this document does not assert enforced branch protection. Review source, assets and build output before release. Confirm permission before redistributing third-party branding or other restricted assets.

For a suspected security issue, contact the repository owners privately through an available organizational channel. Do not put credentials or exploit-sensitive details in a public issue. If a secret is committed, revoke or rotate it and notify the owners; deleting the visible file alone is insufficient.
