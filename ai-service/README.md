# Semantic import analysis service

The generator sends extracted fragments (not the original PDF or URL) to an authenticated Node 24 Vercel Function. AI Gateway uses the deployment's Vercel OIDC identity; there is no browser API key. The service only returns one label per fragment. It does not summarize, rewrite or create clinical advice.

## Activation

1. Create a Vercel project in the owner's team with root directory `ai-service`, Framework Preset **Other**, Node **24.x**, OIDC enabled, and production deployment protection disabled. API authorization remains enforced independently by GitHub owner verification.
2. Connect AI Gateway and ensure the team has available model credits. Model: `openai/gpt-4.1-mini`. Deploy this branch, not `main`.
3. Copy the actual deployment HTTPS origin into `ai-import-config.js` as `baseUrl`, then deploy the generator preview. No secret goes into that file.
4. In the generator, sign in through its existing administrator GitHub login, enable **Automatyczne wyróżnienia AI**, and import a short synthetic article. Verify actual model labels, original text preservation, patient/HCP styling and Undo/Redo before enabling production.

Allowed origins are explicit in `api/analyze.mjs`. Requests from other origins or GitHub users are rejected before any model call. Credentials are used only to verify GitHub identity and never included in model prompts. Payload is limited to 180 fragments / 100,000 characters; model requests contain at most 30 fragments and have timeouts. References are excluded. Model output is fully validated before document mutation. Errors leave the current project untouched; users can explicitly disable AI to import content without it.

Tests use injected classifier responses to verify authorization, input/output validation and UI integration. They do not establish that a live model is available. Run `npm test` from repository root. API tests need no provider credentials.

Current activation blocker: creating the Vercel project returned 403 for team `team_wTsrWUQuWb13vIszOdysBM4u` (`mziarko-doctorones-projects`). No service was deployed and `baseUrl` is intentionally empty. The existing administrator authentication service was not modified.
