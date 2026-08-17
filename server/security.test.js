const assert = require("node:assert/strict");
const test = require("node:test");

const { app, fetchPublicMedia } = require("./index");

function listen() {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

test("admin token is accepted only from header, not query string", async (t) => {
  const { server, base } = await listen();
  t.after(() => server.close());

  const queryRes = await fetch(`${base}/api/admin/state?token=aihot-admin`);
  assert.equal(queryRes.status, 401);

  const headerRes = await fetch(`${base}/api/admin/state`, {
    headers: { "x-admin-token": "aihot-admin" },
  });
  assert.equal(headerRes.status, 200);
});

test("media proxy rejects loopback and private network targets", async (t) => {
  const { server, base } = await listen();
  t.after(() => server.close());

  const loopback = await fetch(`${base}/api/media?url=${encodeURIComponent("http://127.0.0.1:8080/private.png")}`);
  assert.equal(loopback.status, 400);

  const metadata = await fetch(`${base}/api/media?url=${encodeURIComponent("http://169.254.169.254/latest/meta-data/")}`);
  assert.equal(metadata.status, 400);

  const ipv6Loopback = await fetch(`${base}/api/media?url=${encodeURIComponent("http://[::1]/private.png")}`);
  assert.equal(ipv6Loopback.status, 400);
});

test("media fetch validates every redirect and never requests a private redirect target", async () => {
  const requested = [];
  const lookup = async (hostname) => hostname === "public.example"
    ? [{ address: "93.184.216.34", family: 4 }]
    : [{ address: "127.0.0.1", family: 4 }];
  const requestHop = async (target, resolved) => {
    requested.push({ target: target.toString(), resolved });
    return { status: 302, headers: { location: "http://private.example/secret" }, body: Buffer.alloc(0) };
  };

  await assert.rejects(() => fetchPublicMedia(new URL("https://public.example/image.png"), { lookup, requestHop }), /private media/i);
  assert.deepEqual(requested.map((entry) => entry.target), ["https://public.example/image.png"]);
});

test("media fetch pins the validated DNS address used by the request hop", async () => {
  let lookups = 0;
  const result = await fetchPublicMedia(new URL("https://public.example/image.png"), {
    lookup: async () => { lookups += 1; return [{ address: "93.184.216.34", family: 4 }]; },
    requestHop: async (_target, resolved) => ({ status: 200, headers: { "content-type": "image/png" }, body: Buffer.from(resolved.address) }),
  });
  assert.equal(lookups, 1);
  assert.equal(result.body.toString(), "93.184.216.34");
});

test("media fetch rejects the full IPv6 link-local range returned by DNS", async () => {
  await assert.rejects(() => fetchPublicMedia(new URL("https://public.example/image.png"), {
    lookup: async () => [{ address: "fe90::1", family: 6 }],
    requestHop: async () => { throw new Error("must not request"); },
  }), /private media/i);
});

test("public responses include baseline browser security headers", async (t) => {
  const { server, base } = await listen();
  t.after(() => server.close());

  const res = await fetch(`${base}/api/stats`);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-frame-options"), "DENY");
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");
});
