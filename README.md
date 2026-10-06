This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Authentication setup

Authentication uses PostgreSQL for user accounts and revocable server-side sessions. Configure these environment variables in development and in the production host:

- `DATABASE_URL`: PostgreSQL connection string. Use a TLS-enabled connection in production.
- `AUTH_SECRET`: a randomly generated secret with at least 32 bytes. For example, in PowerShell: `[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))`.

To initialize an empty user database and create its first administrator, set `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_USERNAME`, and `BOOTSTRAP_ADMIN_PASSWORD` in the environment and run `npm run auth:bootstrap`. The initial password must be at least 12 characters and include uppercase, lowercase, a number, and a symbol. Bootstrap refuses to run after users already exist; remove the bootstrap password from the environment after initial setup.

Before starting the application, apply the idempotent database schema with `npm run db:migrate`. For a new installation, migrate the schema before running `npm run auth:bootstrap`. Existing browser-local production data is imported once on the first administrator visit and remains in the browser until that import commits successfully.

Administrators can then create and manage accounts from **User Management**. Passwords are stored as scrypt hashes only. Password resets and account/role edits revoke the affected user's active sessions.

Production orders and machine settings are stored in PostgreSQL. Production, QC, and dispatch totals are derived from their transaction records; `production_wip_stages` exposes awaiting-inspection, QC-passed, and rejected/blocked quantities. Mutations use a serialized application version check and a database transaction; repeated request IDs cannot apply twice. The Admin-only backup panel creates and retains JSON exports in PostgreSQL. Exports include user account metadata but exclude password hashes, sessions, and database credentials.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
