const assert = require("assert");
const { spawn } = require("child_process");

const PORT = 4188;
const base = `http://localhost:${PORT}`;
const child = spawn(process.execPath, ["server.js"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(PORT) },
  stdio: ["ignore", "pipe", "pipe"]
});

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function request(path, options) {
  const response = await fetch(`${base}${path}`, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

(async () => {
  try {
    await wait(600);
    const health = await request("/api/health");
    assert.equal(health.response.status, 200);
    assert.equal(health.body.ok, true);

    const login = await request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "john@alrassteel.com", password: "sales123" })
    });
    assert.equal(login.response.status, 200);
    assert.equal(login.body.user.role, "salesman");

    const bootstrap = await request("/api/bootstrap", {
      headers: { Authorization: `Bearer ${login.body.token}` }
    });
    assert.equal(bootstrap.response.status, 200);
    assert.ok(bootstrap.body.leads.every(lead => lead.ownerId === login.body.user.id));
    assert.ok(bootstrap.body.followups.Today || bootstrap.body.followups["Overdue Follow-Ups"]);

    const whisper = await request("/api/ai/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${login.body.token}` },
      body: JSON.stringify({ text: "Customer wants a quote tomorrow." })
    });
    assert.equal(whisper.response.status, 200);
    assert.ok(whisper.body.transcript);

    console.log("api-smoke ok");
  } finally {
    child.kill();
  }
})().catch(error => {
  child.kill();
  console.error(error);
  process.exit(1);
});
