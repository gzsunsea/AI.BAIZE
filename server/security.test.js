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

test("media fetch rejects IPv6 translation and special-use ranges before requesting", async () => {
  const blockedAddresses = [
    "64:ff9b::7f00:1",
    "64:ff9b:1::c000:221",
    "2001:2::1",
    "2001:db8::1",
    "2002:7f00:1::",
    "3fff::1",
    "5f00::1",
  ];
  let requestCount = 0;

  for (const address of blockedAddresses) {
    await assert.rejects(() => fetchPublicMedia(new URL("https://public.example/image.png"), {
      lookup: async () => [{ address, family: 6 }],
      requestHop: async () => {
        requestCount += 1;
        return { status: 200, headers: {}, body: Buffer.alloc(0) };
      },
    }), /private media/i, address);
  }

  assert.equal(requestCount, 0);
});

test("media fetch preserves public IPv4-mapped and well-known NAT64 targets", async () => {
  const requested = [];
  for (const address of ["::ffff:5db8:d822", "64:ff9b::5db8:d822"]) {
    const result = await fetchPublicMedia(new URL("https://public.example/image.png"), {
      lookup: async () => [{ address, family: 6 }],
      requestHop: async (_target, resolved) => {
        requested.push(resolved.address);
        return { status: 200, headers: {}, body: Buffer.from("ok") };
      },
    });
    assert.equal(result.body.toString(), "ok");
  }
  assert.deepEqual(requested, ["::ffff:5db8:d822", "64:ff9b::5db8:d822"]);
});

test("media fetch rejects IANA non-global IPv4 ranges in direct and embedded forms before requesting", async () => {
  const blockedTargets = [
    "http://192.0.0.8/image.png",
    "http://192.0.2.1/image.png",
    "http://198.51.100.1/image.png",
    "http://203.0.113.1/image.png",
    "http://[::ffff:192.0.2.1]/image.png",
    "http://[::ffff:0:198.51.100.1]/image.png",
    "http://[64:ff9b::203.0.113.1]/image.png",
  ];
  let requestCount = 0;

  for (const target of blockedTargets) {
    await assert.rejects(() => fetchPublicMedia(new URL(target), {
      requestHop: async () => {
        requestCount += 1;
        return { status: 200, headers: {}, body: Buffer.alloc(0) };
      },
    }), /private media/i, target);
  }

  assert.equal(requestCount, 0);
});

test("public responses include baseline browser security headers", async (t) => {
  const { server, base } = await listen();
  t.after(() => server.close());

  const res = await fetch(`${base}/api/stats`);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-frame-options"), "DENY");
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");
});
