import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitepress";

const siteUrl = process.env.DOCS_SITE_URL;

const repositoryUrl =
  process.env.DOCS_REPOSITORY_URL ?? "https://github.com/priemskiyyy/trace";

const base =
  process.env.DOCS_BASE_PATH ?? (siteUrl ? new URL(siteUrl).pathname : "/");

const description =
  "Typed, provider-independent product analytics for TypeScript. One API over Amplitude, PostHog, Mixpanel, Segment, Google Analytics, Firebase, your own backend and more, with identity that stays right while providers start, consent that gates delivery, redaction and honest receipts.";

// llms.txt lists every guide with its description; llms-full.txt inlines them.
const writeLlmsText = async (srcDir: string, outDir: string) => {
  const origin = siteUrl ? siteUrl.replace(/\/$/, "") : base.replace(/\/$/, "");

  const files = (await readdir(srcDir, { recursive: true }))
    .filter((file) => file.endsWith(".md"))
    .filter((file) => !file.startsWith(".vitepress"))
    .filter((file) => file !== "README.md" && file !== "index.md")
    .sort();

  const pages = await Promise.all(
    files.map(async (file) => {
      const source = await readFile(join(srcDir, file), "utf8");
      const title = source.match(/^# (.+)$/m)?.[1] ?? file;
      const summary = source.match(/^description: "(.+)"$/m)?.[1] ?? "";
      const url = `${origin}/${file.replace(/\.md$/, "")}`;

      return { title, summary, url, source };
    }),
  );

  const index = [
    "# Trace",
    "",
    `> ${description}`,
    "",
    "## Docs",
    "",
    ...pages.map(
      ({ title, summary, url }) => `- [${title}](${url}): ${summary}`,
    ),
    "",
  ].join("\n");

  const full = pages
    .map(({ url, source }) => `<!-- ${url} -->\n${source.trim()}`)
    .join("\n\n---\n\n");

  await writeFile(join(outDir, "llms.txt"), index);
  await writeFile(join(outDir, "llms-full.txt"), `${full}\n`);
};

export default defineConfig({
  base,
  lang: "en-US",
  title: "Trace",
  description,
  head: [
    [
      "link",
      { rel: "icon", type: "image/svg+xml", href: `${base}favicon.svg` },
    ],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:site_name", content: "Trace" }],
    ["meta", { name: "twitter:card", content: "summary" }],
    ["meta", { name: "theme-color", content: "#6d28d9" }],
  ],
  ...(siteUrl ? { sitemap: { hostname: siteUrl } } : {}),
  vite: {
    resolve: {
      alias: { src: fileURLToPath(new URL(".", import.meta.url)) },
    },
  },
  buildEnd: async ({ outDir, srcDir }) => {
    const sitemap = siteUrl
      ? `Sitemap: ${new URL("sitemap.xml", `${siteUrl.replace(/\/$/, "")}/`).href}\n`
      : "";

    await writeFile(
      join(outDir, "robots.txt"),
      `User-agent: *\nAllow: /\n${sitemap}`,
    );
    await writeLlmsText(srcDir, outDir);
  },
  transformHead: ({ pageData }) => {
    const title =
      pageData.title === "Trace" ? "Trace" : `${pageData.title} | Trace`;

    const head: [string, Record<string, string>][] = [
      ["meta", { property: "og:title", content: title }],
      [
        "meta",
        {
          property: "og:description",
          content: pageData.description || description,
        },
      ],
      ["meta", { name: "twitter:title", content: title }],
      [
        "meta",
        {
          name: "twitter:description",
          content: pageData.description || description,
        },
      ],
    ];

    // Without a site URL the build omits canonical URLs rather than assume a host.
    if (!siteUrl) {
      return head;
    }

    const pagePath = pageData.relativePath
      .replace(/(^|\/)index\.md$/, "$1")
      .replace(/\.md$/, "");

    const url = new URL(pagePath, `${siteUrl.replace(/\/$/, "")}/`).href;

    head.push(
      ["link", { rel: "canonical", href: url }],
      ["meta", { property: "og:url", content: url }],
    );

    return head;
  },
  srcExclude: ["README.md"],
  ignoreDeadLinks: [
    // The hosted React example is copied into dist/demo after the site builds.
    /^\/demo\//,
    // Pages the second half of the site adds; remove each entry once its page exists.
    "./adapters",
    "./adapters/amplitude",
    "./adapters/google-analytics",
    "./devtools",
    "./flare",
    "./native-access",
    "./provider-limitations",
    "./react",
    "./react-native",
    "./servers",
    "./solid",
    "./svelte",
    "./vue",
  ],
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    socialLinks: repositoryUrl ? [{ icon: "github", link: repositoryUrl }] : [],
    ...(repositoryUrl
      ? {
          editLink: { pattern: `${repositoryUrl}/edit/main/docs/:path` },
        }
      : {}),
    nav: [
      { text: "Guide", link: "/getting-started" },
      { text: "Adapters", link: "/adapters" },
      {
        text: "Frameworks",
        items: [
          { text: "React", link: "/react" },
          { text: "Vue", link: "/vue" },
          { text: "Solid", link: "/solid" },
          { text: "Svelte", link: "/svelte" },
          { text: "React Native and Expo", link: "/react-native" },
        ],
      },
      { text: "Devtools", link: "/devtools" },
      { text: "Examples", link: "/examples" },
      {
        text: "Reference",
        items: [
          { text: "Configuration", link: "/configuration" },
          { text: "API reference", link: "/api" },
          { text: "Writing an adapter", link: "/writing-an-adapter" },
          { text: "Verification matrix", link: "/verification" },
          { text: "Runtime architecture", link: "/internals/architecture" },
        ],
      },
    ],
    sidebar: [
      {
        text: "Start here",
        items: [
          { text: "What Trace is", link: "/" },
          { text: "Getting started", link: "/getting-started" },
          { text: "Installation", link: "/installation" },
          { text: "The mental model", link: "/mental-model" },
          { text: "Configuration", link: "/configuration" },
          { text: "Example applications", link: "/examples" },
        ],
      },
      {
        text: "Tracking",
        items: [
          { text: "Events and schemas", link: "/events" },
          { text: "Tracking and receipts", link: "/tracking" },
          { text: "Users and account switching", link: "/users" },
          { text: "Groups", link: "/groups" },
          { text: "Context and scopes", link: "/context-and-scopes" },
          { text: "Consent", link: "/consent" },
          { text: "Privacy and redaction", link: "/privacy" },
          { text: "Routing", link: "/routing" },
        ],
      },
      {
        text: "Delivery",
        items: [
          { text: "Receipts and evidence", link: "/receipts" },
          { text: "Flush and the application lifecycle", link: "/flush" },
        ],
      },
    ],
    search: { provider: "local" },
    outline: { level: [2, 3] },
    footer: { message: "Released under the MIT License." },
  },
});
