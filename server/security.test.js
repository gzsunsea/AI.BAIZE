const assert = require("node:assert/strict");
const test = require("node:test");

const { app, createPinnedLookup, fetchPublicMedia, requestMediaHop } = require("./index");

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

test("public write limiting uses the client address appended by the trusted proxy", async (t) => {
  const { server, base } = await listen();
  t.after(() => server.close());
  const limit = Number(process.env.PUBLIC_WRITE_RATE_MAX || 30);
  const statuses = [];

  for (let index = 1; index <= limit + 1; index += 1) {
    const response = await fetch(`${base}/api/public/ask`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": `198.51.100.${index}, 203.0.113.77`,
      },
      body: JSON.stringify({ question: "What changed?" }),
    });
    statuses.push(response.status);
    await response.arrayBuffer();
  }

  assert.deepEqual(statuses.slice(0, limit), Array(limit).fill(200));
  assert.equal(statuses[limit], 429);
});

test("enabled MCP fails closed when its Host allowlist is empty", async (t) => {
  const previous = Object.fromEntries(["MCP_ENABLED", "MCP_ALLOWED_HOSTS", "MCP_ALLOWED_ORIGINS"].map((key) => [key, process.env[key]]));
  Object.assign(process.env, { MCP_ENABLED: "true", MCP_ALLOWED_HOSTS: "", MCP_ALLOWED_ORIGINS: "127.0.0.1" });
  const { server, base } = await listen();
  t.after(() => {
    server.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const response = await fetch(`${base}/mcp`);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "MCP temporarily unavailable" });
});

test("MCP Host and Origin guards reject untrusted requests and permit clients without Origin", async (t) => {
  const previous = Object.fromEntries(["MCP_ENABLED", "MCP_ALLOWED_HOSTS", "MCP_ALLOWED_ORIGINS"].map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    MCP_ENABLED: "true",
    MCP_ALLOWED_HOSTS: "127.0.0.1",
    MCP_ALLOWED_ORIGINS: "127.0.0.1",
  });
  const { server, base } = await listen();
  t.after(() => {
    server.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const http = require("node:http");
  const request = (headers = {}) => new Promise((resolve, reject) => {
    const url = new URL(`${base}/mcp`);
    const outgoing = http.request({ hostname: url.hostname, port: url.port, path: url.pathname, headers }, (incoming) => {
      const chunks = [];
      incoming.on("data", (chunk) => chunks.push(chunk));
      incoming.on("end", () => resolve({ status: incoming.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    outgoing.on("error", reject);
    outgoing.end();
  });
  const deniedHost = await request({ host: "attacker.example" });
  assert.equal(deniedHost.status, 403);
  const deniedOrigin = await request({ origin: "https://attacker.example" });
  assert.equal(deniedOrigin.status, 403);
  const malformedOrigin = await request({ origin: "not an origin" });
  assert.equal(malformedOrigin.status, 403);
  const noOrigin = await request();
  assert.notEqual(noOrigin.status, 403);
  const allowedOrigin = await request({ origin: `${base}` });
  assert.notEqual(allowedOrigin.status, 403);
  assert.equal([deniedHost.body, deniedOrigin.body, malformedOrigin.body]
    .some((body) => /stack|node_modules|server\/index/i.test(body)), false);
});

test("MCP JSON parser returns bounded, sanitized errors", async (t) => {
  const previous = Object.fromEntries(["MCP_ENABLED", "MCP_ALLOWED_HOSTS", "MCP_ALLOWED_ORIGINS"].map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    MCP_ENABLED: "true",
    MCP_ALLOWED_HOSTS: "127.0.0.1",
    MCP_ALLOWED_ORIGINS: "127.0.0.1",
  });
  const { server, base } = await listen();
  t.after(() => {
    server.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const malformed = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{invalid",
  });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { error: "invalid JSON" });

  const malformedTrailingSlash = await fetch(`${base}/mcp/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{invalid",
  });
  assert.equal(malformedTrailingSlash.status, 400);
  assert.deepEqual(await malformedTrailingSlash.json(), { error: "invalid JSON" });

  const oversized = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload: "x".repeat(65_536) }),
  });
  assert.equal(oversized.status, 413);
  assert.deepEqual(await oversized.json(), { error: "request too large" });
});

test("MCP limiter isolates trusted client IPs and ignores spoofed forwarded prefixes", async (t) => {
  const previous = Object.fromEntries(["MCP_ENABLED", "MCP_ALLOWED_HOSTS", "MCP_ALLOWED_ORIGINS"].map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    MCP_ENABLED: "true",
    MCP_ALLOWED_HOSTS: "127.0.0.1",
    MCP_ALLOWED_ORIGINS: "127.0.0.1",
  });
  const { server, base } = await listen();
  t.after(() => {
    server.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const limit = 60;
  const request = (forwardedFor) => fetch(`${base}/mcp`, {
    headers: { "x-forwarded-for": forwardedFor },
  });
  for (let index = 1; index <= limit; index += 1) {
    const response = await request(`198.51.100.${index}, 203.0.113.77`);
    assert.notEqual(response.status, 429, `request ${index} unexpectedly rate limited`);
    await response.arrayBuffer();
  }
  const independentClient = await request("198.51.100.200, 203.0.113.78");
  assert.notEqual(independentClient.status, 429);
  await independentClient.arrayBuffer();
  const sameClientSpoofedPrefix = await request("198.51.100.201, 203.0.113.77");
  assert.equal(sameClientSpoofedPrefix.status, 429);
  await sameClientSpoofedPrefix.arrayBuffer();
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

test("media fetch forwards an explicit response size ceiling to each request hop", async () => {
  let requestOptions;
  await fetchPublicMedia(new URL("https://public.example/image.png"), {
    maxBytes: 2 * 1024 * 1024,
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    requestHop: async (_target, _resolved, options) => {
      requestOptions = options;
      return { status: 200, headers: { "content-type": "image/png" }, body: Buffer.from("image") };
    },
  });

  assert.equal(requestOptions.maxBytes, 2 * 1024 * 1024);
});

test("pinned media lookup follows the Node scalar and all-address callback contracts", async () => {
  const lookup = createPinnedLookup({ address: "93.184.216.34", family: 4 });
  const scalar = await new Promise((resolve, reject) => {
    lookup("public.example", { family: 4 }, (error, address, family) => {
      if (error) reject(error);
      else resolve({ address, family });
    });
  });
  const all = await new Promise((resolve, reject) => {
    lookup("public.example", { all: true }, (error, addresses) => {
      if (error) reject(error);
      else resolve(addresses);
    });
  });

  assert.deepEqual(scalar, { address: "93.184.216.34", family: 4 });
  assert.deepEqual(all, [{ address: "93.184.216.34", family: 4 }]);
});

test("default media request hop uses the pinned lookup adapter", async (t) => {
  const origin = require("node:http").createServer((_req, res) => {
    res.writeHead(200, { "content-type": "image/png" });
    res.end("image");
  });
  origin.listen(0, "127.0.0.1");
  t.after(() => origin.close());
  await require("node:events").once(origin, "listening");
  const { port } = origin.address();

  const response = await requestMediaHop(
    new URL(`http://public.example:${port}/image.png`),
    { address: "127.0.0.1", family: 4 },
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.toString(), "image");
});

test("media request hop rejects response bodies above its configured byte ceiling", async (t) => {
  const origin = require("node:http").createServer((_req, res) => {
    res.writeHead(200, { "content-type": "image/png" });
    res.end("oversized image");
  });
  origin.listen(0, "127.0.0.1");
  t.after(() => origin.close());
  await require("node:events").once(origin, "listening");
  const { port } = origin.address();

  await assert.rejects(() => requestMediaHop(
    new URL(`http://public.example:${port}/image.png`),
    { address: "127.0.0.1", family: 4 },
    { maxBytes: 4 },
  ), /too large/i);
});

test("media fetch rejects the full IPv6 link-local range returned by DNS", async () => {
  await assert.rejects(() => fetchPublicMedia(new URL("https://public.example/image.png"), {
    lookup: async () => [{ address: "fe90::1", family: 6 }],
    requestHop: async () => { throw new Error("must not request"); },
  }), /private media/i);
});

test("media fetch rejects IPv6 translation and special-use ranges before requesting", async () => {
  const blockedAddresses = [
    "::ffff:7f00:1",
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

test("media fetch rejects IANA-reserved global-unicast space before requesting", async () => {
  let requestCount = 0;

  for (const address of ["2d00::1", "3000::1", "3800::1", "3ff0::1"]) {
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

test("media fetch permits globally reachable assignments within IETF protocol space", async () => {
  const requested = [];
  const result = await fetchPublicMedia(new URL("https://public.example/image.png"), {
    lookup: async () => [{ address: "2001:1::1", family: 6 }],
    requestHop: async (_target, resolved) => {
      requested.push(resolved.address);
      return { status: 200, headers: {}, body: Buffer.from("ok") };
    },
  });

  assert.equal(result.body.toString(), "ok");
  assert.deepEqual(requested, ["2001:1::1"]);
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
