const bcrypt = require("bcryptjs");
const db = require("./db");

function requireAuth(req, res, next) {
  if (!req.session || !req.session.staffId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || req.session.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

function login(email, password) {
  const staff = db
    .prepare("SELECT * FROM staff WHERE email = ?")
    .get(email.toLowerCase().trim());
  if (!staff) return null;
  const ok = bcrypt.compareSync(password, staff.password_hash);
  if (!ok) return null;
  return staff;
}

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

module.exports = { requireAuth, requireAdmin, login, hashPassword };
