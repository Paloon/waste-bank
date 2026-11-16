// Snapshot the home page header and hero into index.html, so visitors see the
// page while the JavaScript bundle is still downloading. React replaces the
// snapshot when it starts. Run after changing the header or hero:
//   npm run build:shell
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "vite";
import { chromium } from "playwright";

const file = new URL("../index.html", import.meta.url);
const start = "<!--shell:start-->";
const end = "<!--shell:end-->";

const server = await createServer({
  server: { port: 0, strictPort: false },
  logLevel: "error",
});
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
  // The hero does not need data; fail API calls so the snapshot stays generic.
  await page.route(
    (u) => u.pathname.startsWith("/api/"),
    (route) => route.abort(),
  );
  page.on("pageerror", (e) => console.error("pageerror", e.message));
  await page.goto(url);
  await page.waitForSelector("main .home-grid .hero h1");
  const shell = await page.evaluate(() => {
    const main = document.querySelector("main");
    const keep = [".eyebrow", ".home-grid", ".skeleton"]
      .map((s) => main.querySelector(":scope > " + s))
      .filter(Boolean)
      .map((el) => el.outerHTML)
      .join("");
    return (
      document.querySelector("header").outerHTML + "<main>" + keep + "</main>"
    );
  });
  const html = shell
    // The date is filled in by React; leave it empty instead of freezing a day.
    .replace(/(<span class="date">)[^<]*(<\/span>)/, "$1$2");
  const source = await readFile(file, "utf8");
  const a = source.indexOf(start);
  const b = source.indexOf(end);
  if (a < 0 || b < a) throw new Error("index.html is missing shell markers");
  await writeFile(
    file,
    source.slice(0, a + start.length) + html + source.slice(b),
  );
  console.log(`index.html shell updated (${html.length} bytes)`);
} finally {
  await browser.close();
  await server.close();
}
