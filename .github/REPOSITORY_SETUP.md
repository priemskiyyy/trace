# Repository setup

The repository is [priemskiyyy/trace](https://github.com/priemskiyyy/trace). These settings complement the files checked into the project. Adding the files enables none of them.

## Documentation

1. Select **GitHub Actions** as the Pages source in the repository settings.
2. Run the `docs-deploy` workflow once the documentation is on `main`.
3. Check the deployed site, its canonical URLs, its sitemap, its mobile navigation and the live demo at `/demo/`.
4. Add the live documentation URL to the repository's About section.

The deployment workflow takes the site URL and base path from GitHub Pages. For another host, set `DOCS_SITE_URL` and `DOCS_BASE_PATH` when building. Set `DOCS_REPOSITORY_URL` if the repository moves.

## Still missing: a logo and a social image

The project has a favicon and nothing else. There is no logo and no social preview image, so the documentation emits no `og:image`, and `scripts/verify-docs.mjs` does not assert one. When an image exists:

1. Add a 1200 by 630 PNG under `docs/public/`.
2. Emit `og:image` and `og:image:alt` from `docs/.vitepress/config.ts`, using the deployed site URL.
3. Restore the social image assertions in `scripts/verify-docs.mjs`. Silo's copy of that script has them.
4. Upload the same image as the repository's social preview, in the General settings. GitHub uses that setting independently of the site's metadata.

## Discovery

Use a concise About description and topics that match the packages. Suggested topics: `product-analytics`, `analytics`, `typescript`, `react`, `react-native`, `expo`, `amplitude`, `posthog`, `mixpanel`, `segment`, `google-analytics`, `firebase`, `privacy`, `consent`, `devtools`.

## Contributions and releases

- Issue forms and the pull request template are in `.github`.
- Enable private vulnerability reporting in the Security settings if a maintainer can monitor it. A library that handles redaction and consent will receive privacy reports, and they should not arrive as public issues.
- Configure branch protection or a ruleset after the required checks have run once: `packages-test`, `packages-verify`, `common-format` and `docs-test`.
- Create the `npm` environment with a required reviewer. The publish job waits for that approval.
- Follow [RELEASING.md](../RELEASING.md) for publication, including the manual first publication that trusted publishing needs.
