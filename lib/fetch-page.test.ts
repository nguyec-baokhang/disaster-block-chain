import assert from "node:assert/strict";
import { test } from "node:test";
import { LinkError, htmlToText, isBlockedAddress, safeLookup, validateUrl } from "./fetch-page";

test("validateUrl blocks private targets and non-http schemes", async (t) => {
  const blocked = [
    "http://localhost/",
    "http://LOCALHOST:3000/admin",
    "http://app.localhost/",
    "http://127.0.0.1/",
    "http://127.1.2.3:8080/",
    "http://2130706433/", // 127.0.0.1 as a decimal integer
    "http://0x7f000001/", // 127.0.0.1 in hex
    "http://0.0.0.0/",
    "http://10.0.0.1/",
    "http://10.255.255.255/",
    "http://172.16.0.1/",
    "http://172.20.10.5/",
    "http://172.31.255.255/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data/", // cloud metadata
    "http://100.64.0.1/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:7f00:1]/",
    "http://[fe80::1]/",
    "http://[fd00::1]/",
    "file:///etc/passwd",
    "ftp://example.com/",
    "javascript:alert(1)",
    "data:text/html,hi",
    "gopher://example.com/",
    "http://user:pass@example.com/",
    "not a url",
    "",
  ];
  for (const url of blocked) {
    await t.test(`blocks ${url || "(empty)"}`, () => assert.throws(() => validateUrl(url), LinkError));
  }

  const allowed = ["https://www.weather.gov/", "http://example.com/news?id=1", "https://8.8.8.8/", "https://172.32.0.1/", "https://[2606:4700::1111]/"];
  for (const url of allowed) {
    await t.test(`allows ${url}`, () => assert.equal(validateUrl(url).protocol.startsWith("http"), true));
  }
});

test("isBlockedAddress", async (t) => {
  const testCases = [
    { ip: "127.0.0.1", want: true },
    { ip: "10.1.2.3", want: true },
    { ip: "172.15.255.255", want: false },
    { ip: "172.16.0.0", want: true },
    { ip: "172.31.255.255", want: true },
    { ip: "172.32.0.0", want: false },
    { ip: "192.168.0.1", want: true },
    { ip: "169.254.0.1", want: true },
    { ip: "::1", want: true },
    { ip: "::ffff:10.0.0.1", want: true },
    { ip: "fe80::1%eth0", want: true },
    { ip: "8.8.8.8", want: false },
    { ip: "2606:4700::1111", want: false },
    { ip: "example.com", want: true }, // not an IP: refuse
  ];
  for (const tc of testCases) {
    await t.test(`${tc.ip} → ${tc.want ? "blocked" : "allowed"}`, () => assert.equal(isBlockedAddress(tc.ip), tc.want));
  }
});

test("safeLookup refuses a hostname that resolves to a private address", async () => {
  const err = await new Promise<unknown>((resolve) => safeLookup("localhost", {}, (e) => resolve(e)));
  assert.ok(err instanceof LinkError, "connect-time DNS check rejects loopback");
});

test("htmlToText", async (t) => {
  await t.test("keeps title and readable text, drops scripts and styles", () => {
    const html = `<html><head><title>Old title</title><meta property="og:title" content="Boil Water Advisory &amp; Update"><style>p{}</style></head>
      <body><nav>Home | About</nav><script>alert("x")</script><h1>Hamilton County</h1><p>Boil water&nbsp;until&#160;Friday.</p><p>Call 311 &#x2014; now</p></body></html>`;
    const page = htmlToText(html);
    assert.equal(page.title, "Boil Water Advisory & Update");
    assert.equal(page.text, "Hamilton County\nBoil water until Friday.\nCall 311 — now");
  });
  await t.test("falls back to <title>", () => assert.equal(htmlToText("<title> A  B </title><p>x</p>").title, "A B"));
});
