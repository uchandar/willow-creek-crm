const express = require("express");
const cors = require("cors");
const session = require("express-session");

require("./db"); // ensures schema is created on boot

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
app.use(
  session({
    secret: process.env.SESSION_SECRET || "willow-creek-dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false, // set true when served over HTTPS in production
      maxAge: 1000 * 60 * 60 * 8, // 8 hours
    },
  })
);

app.use("/api/auth", require("./routes/auth"));
app.use("/api/residents", require("./routes/residents"));
app.use("/api/rooms", require("./routes/rooms"));
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/custom-fields", require("./routes/customFields"));
app.use("/api/tasks", require("./routes/tasks"));
app.use("/api/audit-log", require("./routes/auditLog"));

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Willow Creek CRM server running on http://localhost:${PORT}`);
});
