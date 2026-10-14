const express = require("express");
const router = express.Router();
const { login } = require("../auth");

router.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  const staff = login(email, password);
  if (!staff) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  req.session.staffId = staff.id;
  req.session.role = staff.role;
  res.json({ id: staff.id, name: staff.name, email: staff.email, role: staff.role });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get("/me", (req, res) => {
  if (!req.session || !req.session.staffId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const db = require("../db");
  const staff = db
    .prepare("SELECT id, name, email, role FROM staff WHERE id = ?")
    .get(req.session.staffId);
  if (!staff) return res.status(401).json({ error: "Not authenticated" });
  res.json(staff);
});

module.exports = router;
