const assert = require("node:assert/strict");
const test = require("node:test");

const { app } = require("./index");

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
});

test("public responses include baseline browser security headers", async (t) => {
  const { server, base } = await listen();
  t.after(() => server.close());

  const res = await fetch(`${base}/api/stats`);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-frame-options"), "DENY");
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");
});
