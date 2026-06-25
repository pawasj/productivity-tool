<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Deployment

This app is deployed to **Hostinger** (NOT Vercel), live at **bombaycontentcompany.com**.
Deployment is fully automatic: any push to the `main` branch triggers the
GitHub Actions workflow (`.github/workflows/deploy.yml`), which builds the app
on the runner and ships it over SSH to Hostinger, then restarts. A push to
`main` goes live in ~3-4 minutes. Do not tell the user it deploys to Vercel.

Environment variables live in the GitHub Actions secret `ENV_FILE` (and are
written to `.env.local` during the build). To add/change an env var, edit that
secret — not the Hostinger panel.
