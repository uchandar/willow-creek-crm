const express = require("express");
const cors = require("cors");
const cookieSession = require("cookie-session");

require("./db"); // ensures schema is created on boot
if (process.env.VERCEL) require("./seed"); // fresh /tmp DB on each cold start needs demo data + admin login

const app = express();
const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

app.use(express.json());
app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  })
);
// Sessions live in a signed cookie, not server memory: on Vercel each request can hit a
// different serverless instance, so an in-memory session store forgets the login.
app.set("trust proxy", 1);
app.use(
  cookieSession({
    name: "wc_session",
    secret: process.env.SESSION_SECRET || "willow-creek-dev-secret-change-me",
    httpOnly: true,
    sameSite: "lax",
    secure: !!process.env.VERCEL,
    maxAge: 1000 * 60 * 60 * 8, // 8 hours
  })
);

app.use("/api/auth", require("./routes/auth"));
app.use("/api/residents", require("./routes/residents"));
app.use("/api/rooms", require("./routes/rooms"));
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/custom-fields", require("./routes/customFields"));
app.use("/api/tasks", require("./routes/tasks"));
app.use("/api/audit-log", require("./routes/auditLog"));
app.use("/api/meetings", require("./routes/meetings"));
app.use("/api/medications", require("./routes/medPass"));

app.get("/api/health", (req, res) => res.json({ ok: true }));

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Willow Creek CRM server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
