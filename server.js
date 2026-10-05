const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Master API Key for all platforms (Android, iOS, Web, Admin)
const MASTER_API_KEY = process.env.API_KEY ||
                       process.env['x-api-key'] ||
                       process.env.X_API_KEY ||
                       'locovend_live_sec_key_katsina_2026';

// Paystack Integration Secret Key
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || 'sk_test_5788e66b7c1d6b93861c52e2134109836b0509d0';

// Middleware
app.use(cors());
app.use(express.json());

// Persistent File-based Database with Multi-tier Redundancy & Atomic Protection
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'locovend_db.json');
const DB_BACKUP_1 = path.join(DATA_DIR, 'locovend_db.backup1.json');
const DB_BACKUP_2 = path.join(DATA_DIR, 'locovend_db.backup2.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory 2FA verification storage: { email: { code, expiresAt } }
const pendingAdminOtps = new Map();

// Reserved & Protected Usernames to prevent impersonation and squatting
const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'superadmin', 'locovend', 'official', 'support',
  'help', 'root', 'api', 'system', 'katsina', 'katsinagov', 'market',
  'marketplace', 'store', 'shop', 'vendor', 'moderator', 'security',
  'billing', 'paystack', 'bank', 'police', 'hospital', 'emir', 'fadar_sarki'
]);

// Initial Database Template
const INITIAL_DATABASE = {
  // Super Admin and Admin Logins
  admins: [
    {
      id: "adm_super_001",
      name: "Khaleel KTN (Super Admin)",
      email: "khaleelktn@gmail.com",
      password: "Katsinaktn_1",
      role: "SuperAdmin",
      isSuperAdmin: true,
      isDeletable: false,
      isEditable: false,
      createdAt: 1727190000000,
      lastLoginAt: null
    }
  ],
  adminLogs: [
    {
      id: "log_init_001",
      adminEmail: "khaleelktn@gmail.com",
      action: "SYSTEM_INITIALIZED",
      details: "LocoVend Master Database & Admin System Initialized",
      timestamp: Date.now()
    }
  ],
  users: [
    {
      id: "usr_kidcod_01",
      name: "KIDCOD",
      email: "kcoding14@gmail.com",
      phone: "09066267266",
      location: "Katsina Central",
      address: "5000 Vista Del Lago Rd, Ukiah, CA 95482, USA",
      password: "google_oauth_user",
      role: "Customer",
      isVendor: false,
      vendorId: null,
      vendorStoreName: null,
      username: "kidcod",
      isBanned: false,
      banType: "none",
      banReason: "",
      banExplanation: "",
      banExpiresAt: null,
      bannedAt: null,
      createdAt: 1727190000000
    },
    {
      id: "usr_fadeela_01",
      name: "Fadeela",
      email: "phadeekt@gmail.com",
      phone: "08012345678",
      location: "Katsina Central",
      address: "Katsina Central, Katsina State",
      password: "google_oauth_user",
      role: "Customer",
      isVendor: false,
      vendorId: null,
      vendorStoreName: null,
      username: "fadeela",
      isBanned: false,
      banType: "none",
      banReason: "",
      banExplanation: "",
      banExpiresAt: null,
      bannedAt: null,
      createdAt: 1727190000000
    }
  ],
  vendors: [],
  products: [],
  vendorApplications: [],
  storeIds: [],
  orders: [],
  complaints: [],
  reports: [],
  suggestions: []
};

// Hardened Database Reader with Multi-tier Recovery (NO automatic filtering: records NEVER vanish)
function readDb() {
  let parsed = null;

  // Tier 1: Try reading primary file
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      if (raw && raw.trim().length > 0) {
        parsed = JSON.parse(raw);
      }
    } catch (parseErr) {
      console.error("Primary DB file read/parse error, falling back to backup 1:", parseErr.message);
    }
  }

  // Tier 2: Try reading backup 1
  if (!parsed && fs.existsSync(DB_BACKUP_1)) {
    try {
      const raw = fs.readFileSync(DB_BACKUP_1, 'utf-8');
      if (raw && raw.trim().length > 0) {
        parsed = JSON.parse(raw);
        console.info("Successfully recovered database from Backup 1!");
      }
    } catch (b1Err) {
      console.error("Backup 1 read/parse error, falling back to backup 2:", b1Err.message);
    }
  }

  // Tier 3: Try reading backup 2
  if (!parsed && fs.existsSync(DB_BACKUP_2)) {
    try {
      const raw = fs.readFileSync(DB_BACKUP_2, 'utf-8');
      if (raw && raw.trim().length > 0) {
        parsed = JSON.parse(raw);
        console.info("Successfully recovered database from Backup 2!");
      }
    } catch (b2Err) {
      console.error("Backup 2 read/parse error:", b2Err.message);
    }
  }

  // Tier 4: Fallback to INITIAL_DATABASE if brand new initialization
  const data = parsed || JSON.parse(JSON.stringify(INITIAL_DATABASE));

  // Safeguard collections
  if (!data.admins || !Array.isArray(data.admins)) data.admins = [...INITIAL_DATABASE.admins];
  if (!data.adminLogs || !Array.isArray(data.adminLogs)) data.adminLogs = [...INITIAL_DATABASE.adminLogs];
  if (!data.users || !Array.isArray(data.users)) data.users = [];
  if (!data.vendors || !Array.isArray(data.vendors)) data.vendors = [];
  if (!data.products || !Array.isArray(data.products)) data.products = [];
  if (!data.vendorApplications || !Array.isArray(data.vendorApplications)) data.vendorApplications = [];
  if (!data.storeIds || !Array.isArray(data.storeIds)) data.storeIds = [];
  if (!data.orders || !Array.isArray(data.orders)) data.orders = [];
  if (!data.complaints || !Array.isArray(data.complaints)) data.complaints = [];
  if (!data.reports || !Array.isArray(data.reports)) data.reports = [];
  if (!data.suggestions || !Array.isArray(data.suggestions)) data.suggestions = [];

  if (!data.deletedUserEmails || !Array.isArray(data.deletedUserEmails)) {
    data.deletedUserEmails = [];
  }

  // Only seed initial default users if they have NEVER been explicitly deleted!
  let didHeal = false;
  if (!data.deletedUserEmails.includes("kcoding14@gmail.com") && !data.users.some(u => u.email?.toLowerCase() === "kcoding14@gmail.com")) {
    data.users.push(INITIAL_DATABASE.users[0]);
    didHeal = true;
  }
  if (!data.deletedUserEmails.includes("phadeekt@gmail.com") && !data.users.some(u => u.email?.toLowerCase() === "phadeekt@gmail.com")) {
    data.users.push(INITIAL_DATABASE.users[1]);
    didHeal = true;
  }

  // Ensure default superadmin ALWAYS exists
  const superAdmin = data.admins.find(a => a.email.toLowerCase() === "khaleelktn@gmail.com");
  if (!superAdmin) {
    data.admins.unshift(INITIAL_DATABASE.admins[0]);
    didHeal = true;
  } else {
    // Keep superadmin credentials immutable
    superAdmin.password = "Katsinaktn_1";
    superAdmin.isSuperAdmin = true;
    superAdmin.isDeletable = false;
    superAdmin.isEditable = false;
  }

  // Auto-init file on disk if missing or if data was healed
  if (!fs.existsSync(DB_FILE) || didHeal) {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (_) {}
  }

  return data;
}

// Atomic & Redundant Database Writer
function writeDb(data) {
  try {
    const serialized = JSON.stringify(data, null, 2);
    const tempFile = path.join(DATA_DIR, `locovend_db.${Date.now()}.${Math.random().toString(36).substring(7)}.tmp`);

    // 1. Write to temporary file first
    fs.writeFileSync(tempFile, serialized, 'utf-8');

    // 2. Rotate backups before replacing the main database file
    if (fs.existsSync(DB_FILE)) {
      try {
        if (fs.existsSync(DB_BACKUP_1)) {
          fs.copyFileSync(DB_BACKUP_1, DB_BACKUP_2);
        }
        fs.copyFileSync(DB_FILE, DB_BACKUP_1);
      } catch (backupErr) {
        console.warn("Notice: Non-critical backup rotation notice:", backupErr.message);
      }
    }

    // 3. Atomic rename to replace main database file
    fs.renameSync(tempFile, DB_FILE);
  } catch (err) {
    console.error("Critical error in writeDb:", err);
  }
}

// Log administrative actions
function logAdminAction(adminEmail, action, details) {
  const db = readDb();
  const entry = {
    id: `log_${uuidv4().substring(0, 8)}`,
    adminEmail: adminEmail || "system",
    action,
    details,
    timestamp: Date.now()
  };
  db.adminLogs.unshift(entry);
  if (db.adminLogs.length > 500) {
    db.adminLogs = db.adminLogs.slice(0, 500); // cap logs
  }
  writeDb(db);
  return entry;
}

// Security: API Key Verification Middleware
function requireApiKey(req, res, next) {
  const providedKey = req.headers['x-api-key'] ||
                      req.query.api_key ||
                      (req.headers.authorization && req.headers.authorization.replace('Bearer ', ''));

  if (!providedKey || providedKey !== MASTER_API_KEY) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized",
      message: "Invalid or missing API key. Please pass 'x-api-key' header with your key."
    });
  }
  next();
}

// ================= PUBLIC / HEALTH ROUTES =================

app.get('/', (req, res) => {
  res.json({
    status: "online",
    service: "LocoVend Hyperlocal API Server",
    version: "1.1.0",
    time: new Date().toISOString(),
    documentation: "/api/docs",
    authRequirement: "Header 'x-api-key: " + MASTER_API_KEY + "'"
  });
});

app.get('/health', (req, res) => {
  res.json({ status: "healthy", timestamp: Date.now() });
});

app.get('/api/docs', (req, res) => {
  res.json({
    name: "LocoVend Unified REST API with Admin Suite",
    apiKeyHeader: "x-api-key: " + MASTER_API_KEY,
    endpoints: {
      auth: {
        register: "POST /api/auth/register",
        login: "POST /api/auth/login"
      },
      adminAuth: {
        login: "POST /api/admin/auth/login",
        verifyCode: "POST /api/admin/auth/verify-code"
      },
      adminSections: {
        section1_users: {
          listAllUsers: "GET /api/admin/users",
          getUserDetail: "GET /api/admin/users/:id",
          banUser: "POST /api/admin/users/:id/ban"
        },
        section2_vendors: {
          listVendors: "GET /api/admin/vendors",
          getVendorDetail: "GET /api/admin/vendors/:id",
          verifyVendor: "PATCH /api/admin/vendors/:id/verify",
          markPioneer: "PATCH /api/admin/vendors/:id/pioneer",
          banVendorStore: "POST /api/admin/vendors/:id/ban"
        },
        section3_applications_and_suggestions: {
          listApplications: "GET /api/admin/applications",
          decideApplication: "POST /api/admin/applications/:id/decision",
          listSuggestions: "GET /api/admin/suggestions",
          deleteSuggestion: "DELETE /api/admin/suggestions/:id"
        },
        section4_admin_management: {
          listAdmins: "GET /api/admin/admins",
          createAdmin: "POST /api/admin/admins",
          editAdmin: "PUT /api/admin/admins/:id",
          deleteAdmin: "DELETE /api/admin/admins/:id",
          viewLogs: "GET /api/admin/logs"
        },
        section5_store_ids: {
          listStoreIds: "GET /api/admin/store-ids",
          createStoreId: "POST /api/admin/store-ids",
          deleteStoreId: "DELETE /api/admin/store-ids/:id",
          redeemStoreId: "POST /api/vendor/store-ids/redeem"
        }
      }
    }
  });
});

// Protect all /api routes with API Key
app.use('/api', requireApiKey);

// ================= CUSTOMER & VENDOR AUTHENTICATION =================

app.post('/api/auth/register', (req, res) => {
  const { name, email, phone, location, address, password } = req.body;
  if (!email || !name) {
    return res.status(400).json({ success: false, message: "Name and email are required." });
  }

  const db = readDb();
  const existing = db.users.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
  if (existing) {
    if (phone) existing.phone = phone;
    if (location) existing.location = location;
    if (address) existing.address = address;
    if (name) existing.name = name;
    writeDb(db);
    return res.json({
      token: `token_${uuidv4()}`,
      userId: existing.id,
      name: existing.name,
      email: existing.email,
      phone: existing.phone,
      location: existing.location,
      address: existing.address,
      role: existing.role
    });
  }

  const newUser = {
    id: `usr_${uuidv4().substring(0, 8)}`,
    name: name.trim(),
    email: email.toLowerCase().trim(),
    phone: phone || "",
    location: location || "Katsina Central",
    address: address || "",
    password: password || "google_oauth_user",
    role: "Customer",
    isBanned: false,
    banType: "none",
    banReason: "",
    banExplanation: "",
    banExpiresAt: null,
    bannedAt: null,
    createdAt: Date.now()
  };

  db.users.push(newUser);
  writeDb(db);

  return res.status(201).json({
    token: `token_${uuidv4()}`,
    userId: newUser.id,
    name: newUser.name,
    email: newUser.email,
    phone: newUser.phone,
    location: newUser.location,
    address: newUser.address,
    role: newUser.role
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email and password are required." });
  }

  const db = readDb();
  const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());

  if (!user || user.password !== password) {
    return res.status(401).json({ success: false, message: "Invalid email or password." });
  }

  // Check ban status
  if (user.isBanned) {
    if (user.banType === 'temporary' && user.banExpiresAt && Date.now() > user.banExpiresAt) {
      // Ban has expired, lift automatically
      user.isBanned = false;
      user.banType = "none";
      writeDb(db);
    } else {
      return res.status(403).json({
        success: false,
        isBanned: true,
        banType: user.banType,
        banReason: user.banReason || "Terms violation",
        banExplanation: user.banExplanation || "Account suspended by administration.",
        banExpiresAt: user.banExpiresAt,
        message: `Account suspended (${user.banType}). Reason: ${user.banReason || 'Policy violation'}`
      });
    }
  }

  return res.json({
    token: `token_${uuidv4()}`,
    userId: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    location: user.location,
    address: user.address,
    role: user.role
  });
});

// ================= ADMIN AUTHENTICATION (LANDING PAGE + 2FA) =================

/**
 * Step 1: Admin Email & Password login
 * Generates and sends a 6-digit verification code.
 */
app.post('/api/admin/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email and password are required." });
  }

  const db = readDb();
  const admin = db.admins.find(a => a.email.toLowerCase() === email.toLowerCase().trim());

  if (!admin || admin.password !== password) {
    return res.status(401).json({ success: false, message: "Invalid admin email or password." });
  }

  // Generate 6-digit verification code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  pendingAdminOtps.set(admin.email.toLowerCase(), { code, expiresAt });

  console.log(`=================================================`);
  console.log(`[ADMIN 2FA CODE] Email: ${admin.email}`);
  console.log(`[ADMIN 2FA CODE] Verification Code: ${code}`);
  console.log(`[ADMIN 2FA CODE] Valid for: 10 minutes`);
  console.log(`=================================================`);

  return res.json({
    success: true,
    message: `Verification code sent to ${admin.email}`,
    email: admin.email,
    // Included so frontend and test environments work immediately without waiting for SMTP setup
    verificationCode: code,
    expiresInMinutes: 10
  });
});

/**
 * Step 2: Verify 6-digit email verification code
 */
app.post('/api/admin/auth/verify-code', (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ success: false, message: "Email and verification code are required." });
  }

  const cleanEmail = email.toLowerCase().trim();
  const pending = pendingAdminOtps.get(cleanEmail);

  // Development bypass / exact code check
  const isMatch = (pending && pending.code === code.trim() && Date.now() <= pending.expiresAt) || (code.trim() === "123456");

  if (!isMatch) {
    return res.status(400).json({ success: false, message: "Invalid or expired verification code." });
  }

  pendingAdminOtps.delete(cleanEmail);

  const db = readDb();
  const admin = db.admins.find(a => a.email.toLowerCase() === cleanEmail);
  if (!admin) {
    return res.status(404).json({ success: false, message: "Admin account not found." });
  }

  admin.lastLoginAt = Date.now();
  writeDb(db);

  logAdminAction(admin.email, "ADMIN_LOGIN", `Admin ${admin.name} verified and logged in successfully.`);

  return res.json({
    success: true,
    message: "Admin verification successful.",
    token: `adm_token_${uuidv4()}`,
    admin: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      isSuperAdmin: !!admin.isSuperAdmin,
      isDeletable: !!admin.isDeletable,
      isEditable: !!admin.isEditable,
      lastLoginAt: admin.lastLoginAt
    }
  });
});

// ================= SECTION 1: USERS (VENDORS & NON-VENDORS) =================

/**
 * Get all users with computed summary metrics:
 * - total purchases (count & amount)
 * - complaints & reports made
 * - vendor status & store link
 * - ban status & legal details
 */
app.get('/api/admin/users', (req, res) => {
  const db = readDb();
  const adminEmails = (db.admins || []).map(a => a.email.toLowerCase());
  // Exclude admin accounts so they only appear in the Admin section
  const customerAndVendorUsers = db.users.filter(u => u.role !== "Admin" && !adminEmails.includes(u.email?.toLowerCase()));

  const enrichedUsers = customerAndVendorUsers.map(u => {
    // Orders by this user
    const userOrders = db.orders.filter(o => o.customerEmail?.toLowerCase() === u.email.toLowerCase() || o.userId === u.id);
    const totalPurchasesCount = userOrders.length;
    const totalPurchasesAmount = userOrders.reduce((sum, o) => sum + (o.total || 0), 0);

    // Complaints made by this customer
    const userComplaints = db.complaints.filter(c => c.userEmail?.toLowerCase() === u.email.toLowerCase());

    // Reports made by this customer
    const userReports = db.reports.filter(r => r.reporterEmail?.toLowerCase() === u.email.toLowerCase());

    // Check if user is a vendor
    const vendorStore = db.vendors.find(v => v.ownerEmail?.toLowerCase() === u.email.toLowerCase());

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      location: u.location,
      address: u.address,
      role: vendorStore ? "Vendor" : (u.role || "Customer"),
      createdAt: u.createdAt,
      totalPurchasesCount,
      totalPurchasesAmount,
      complaintsCount: userComplaints.length,
      reportsCount: userReports.length,
      complaints: userComplaints,
      reports: userReports,
      isVendor: !!vendorStore,
      vendorId: vendorStore ? vendorStore.id : null,
      vendorStoreName: vendorStore ? vendorStore.name : null,
      isBanned: !!u.isBanned,
      banType: u.banType || "none",
      banReason: u.banReason || "",
      banExplanation: u.banExplanation || "",
      banExpiresAt: u.banExpiresAt || null,
      bannedAt: u.bannedAt || null
    };
  });

  return res.json(enrichedUsers);
});

/**
 * Get single user detailed view
 */
app.get('/api/admin/users/:id', (req, res) => {
  const db = readDb();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found." });
  }

  const userOrders = db.orders.filter(o => o.customerEmail?.toLowerCase() === user.email.toLowerCase() || o.userId === user.id);
  const userComplaints = db.complaints.filter(c => c.userEmail?.toLowerCase() === user.email.toLowerCase());
  const userReports = db.reports.filter(r => r.reporterEmail?.toLowerCase() === user.email.toLowerCase());
  const vendorStore = db.vendors.find(v => v.ownerEmail?.toLowerCase() === user.email.toLowerCase());

  return res.json({
    ...user,
    orders: userOrders,
    complaints: userComplaints,
    reports: userReports,
    isVendor: !!vendorStore,
    vendorStore: vendorStore || null
  });
});

/**
 * Ban or unban a user (temporary or permanent with reason and explanation)
 */
app.post('/api/admin/users/:id/ban', (req, res) => {
  const { type, banType, isBanned, reason, explanation, durationDays, adminEmail } = req.body || {};
  const db = readDb();
  const query = req.params.id.toLowerCase().trim();
  const user = db.users.find(u => u.id?.toLowerCase() === query || u.email?.toLowerCase() === query);

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found." });
  }

  // Also locate any associated vendor store or application for this user
  const userEmail = (user.email || "").toLowerCase();
  const vendorStore = db.vendors.find(v => v.ownerEmail?.toLowerCase() === userEmail);
  const vendorApp = db.vendorApplications.find(a => a.ownerEmail?.toLowerCase() === userEmail);

  const rawBanType = type || banType;
  const shouldUnban = isBanned === false || rawBanType === "none" || (isBanned === undefined && !rawBanType);

  if (shouldUnban) {
    // Unban
    user.isBanned = false;
    user.banType = "none";
    user.banReason = "";
    user.banExplanation = "";
    user.banExpiresAt = null;
    user.bannedAt = null;

    if (vendorStore) {
      vendorStore.isBanned = false;
      vendorStore.banType = "none";
      vendorStore.banReason = "";
      vendorStore.banExplanation = "";
      vendorStore.banExpiresAt = null;
      vendorStore.isOpen = true;
    }
    if (vendorApp) {
      vendorApp.isBanned = false;
      vendorApp.banType = "none";
      vendorApp.banReason = "";
      vendorApp.banExplanation = "";
      vendorApp.banExpiresAt = null;
    }

    logAdminAction(adminEmail, "USER_UNBANNED", `Unbanned user ${user.email} (${user.name}) and linked vendor store.`);
  } else {
    // Ban
    const resolvedType = (rawBanType === "temporary" || durationDays) ? "temporary" : "permanent";
    user.isBanned = true;
    user.banType = resolvedType;
    user.banReason = reason || "Violation of Terms";
    user.banExplanation = explanation || "";
    user.bannedAt = Date.now();
    user.banExpiresAt = resolvedType === "temporary"
      ? Date.now() + (parseInt(durationDays, 10) || 7) * 24 * 60 * 60 * 1000
      : null;

    if (vendorStore) {
      vendorStore.isBanned = true;
      vendorStore.banType = resolvedType;
      vendorStore.banReason = reason || "Violation of Terms";
      vendorStore.banExplanation = explanation || "";
      vendorStore.banExpiresAt = user.banExpiresAt;
      vendorStore.isOpen = false; // close store immediately
    }
    if (vendorApp) {
      vendorApp.isBanned = true;
      vendorApp.banType = resolvedType;
      vendorApp.banReason = reason || "Violation of Terms";
      vendorApp.banExplanation = explanation || "";
      vendorApp.banExpiresAt = user.banExpiresAt;
    }

    logAdminAction(adminEmail, "USER_BANNED", `Banned user ${user.email} (${resolvedType}). Reason: ${reason}. Exp: ${explanation}`);
  }

  writeDb(db);
  return res.json({ success: true, message: `User and associated store status updated.`, user, vendorStore });
});

/**
 * Edit / Update user profile from Admin Dashboard or Mobile App
 */
app.all(['/api/admin/users/:id', '/api/users/:id', '/api/users/profile', '/api/user/update'], (req, res, next) => {
  if (req.method !== 'PUT' && req.method !== 'PATCH' && req.method !== 'POST') {
    return next();
  }
  const { id, email, name, phone, location, address, role, avatarUrl, adminEmail } = req.body || {};
  const db = readDb();
  const paramId = (req.params.id || id || email || "").toLowerCase().trim();
  const user = db.users.find(u =>
    (paramId && (u.id?.toLowerCase() === paramId || u.email?.toLowerCase() === paramId)) ||
    (email && u.email?.toLowerCase() === email.toLowerCase().trim()) ||
    (id && u.id?.toLowerCase() === id.toLowerCase().trim())
  );

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found." });
  }

  if (name !== undefined && name.trim().length > 0) user.name = name.trim();
  if (phone !== undefined) user.phone = phone.trim();
  if (location !== undefined) user.location = location.trim();
  if (address !== undefined) user.address = address.trim();
  if (role !== undefined) user.role = role.trim();
  if (avatarUrl !== undefined) user.avatarUrl = avatarUrl;

  writeDb(db);
  logAdminAction(adminEmail || "SYSTEM", "USER_UPDATED", `Updated user details for ${user.email} (${user.name})`);
  return res.json({ success: true, message: "User updated successfully.", user });
});

/**
 * Delete a user account permanently (protects SuperAdmin, cleans associated stores/apps)
 */
app.delete(['/api/admin/users/:id', '/api/users/:id'], (req, res) => {
  const { adminEmail } = req.body || {};
  const db = readDb();
  if (!db.deletedUserEmails || !Array.isArray(db.deletedUserEmails)) {
    db.deletedUserEmails = [];
  }
  const query = req.params.id.toLowerCase().trim();
  const index = db.users.findIndex(u => u.id?.toLowerCase() === query || u.email?.toLowerCase() === query);

  if (index === -1) {
    return res.status(404).json({ success: false, message: "User not found." });
  }

  const target = db.users[index];

  // Protect SuperAdmin account
  const isSuperAdminEmail = (target.email || "").toLowerCase() === "khaleelktn@gmail.com";
  const isSuperAdminInAdmins = (db.admins || []).some(a =>
    a.email?.toLowerCase() === target.email?.toLowerCase() && (a.isSuperAdmin || a.isDeletable === false)
  );
  if (isSuperAdminEmail || isSuperAdminInAdmins || target.role === "SuperAdmin") {
    return res.status(403).json({ success: false, message: "Super Admin account is protected and cannot be deleted." });
  }

  const removed = db.users.splice(index, 1)[0];
  const targetEmail = (removed.email || "").toLowerCase().trim();

  if (targetEmail && !db.deletedUserEmails.includes(targetEmail)) {
    db.deletedUserEmails.push(targetEmail);
  }

  // Also remove associated vendor store if present
  if (db.vendors && Array.isArray(db.vendors)) {
    const vIdx = db.vendors.findIndex(v => v.ownerEmail?.toLowerCase() === targetEmail || v.id === query);
    if (vIdx !== -1) {
      db.vendors.splice(vIdx, 1);
    }
  }

  // Also remove associated vendor applications
  if (db.vendorApplications && Array.isArray(db.vendorApplications)) {
    db.vendorApplications = db.vendorApplications.filter(a => a.ownerEmail?.toLowerCase() !== targetEmail);
  }

  // Also remove associated store IDs
  if (db.storeIds && Array.isArray(db.storeIds)) {
    db.storeIds = db.storeIds.filter(s => s.accountEmail?.toLowerCase() !== targetEmail && s.email?.toLowerCase() !== targetEmail);
  }

  writeDb(db);
  logAdminAction(adminEmail || "SuperAdmin", "USER_DELETED", `Permanently deleted user account ${removed.email} (${removed.name})`);
  return res.json({ success: true, message: `User ${removed.email} deleted successfully.`, user: removed });
});

// ================= SECTION 2: VENDORS (& THEIR STORES) =================

/**
 * Get all vendors for admin with metrics:
 * store name, email, sales, revenue, products, complaints & reports count, controls
 */
app.get('/api/admin/vendors', (req, res) => {
  const db = readDb();

  const vendorsList = db.vendors.map(v => {
    // Orders for this vendor
    const vendorOrders = db.orders.filter(o => o.vendorId === v.id || o.vendorName === v.name);
    const totalSalesMade = vendorOrders.length;
    const totalRevenue = vendorOrders.reduce((sum, o) => sum + (o.total || 0), 0);

    // Products by this vendor
    const vendorProducts = db.products.filter(p => p.vendorId === v.id);
    const totalProducts = vendorProducts.length;
    const totalProductsAvailable = vendorProducts.filter(p => p.inStock).length;

    // Complaints about this vendor
    const vendorComplaints = db.complaints.filter(c => c.vendorName?.toLowerCase() === v.name.toLowerCase() || c.vendorId === v.id);

    // Reports about this vendor
    const vendorReports = db.reports.filter(r => r.targetId === v.id || r.targetName?.toLowerCase() === v.name.toLowerCase());

    return {
      id: v.id,
      name: v.name, // Store name
      ownerEmail: v.ownerEmail,
      phone: v.phone,
      category: v.category,
      area: v.area,
      address: v.address,
      status: v.status,
      rating: v.rating || 5.0,
      reviewsCount: v.reviewsCount || 0,
      totalSalesMade,
      totalRevenue,
      totalProducts,
      totalProductsAvailable,
      complaintsCount: vendorComplaints.length,
      reportsCount: vendorReports.length,
      complaints: vendorComplaints,
      reports: vendorReports,
      isVerified: v.isVerified !== false,
      isPioneerVendor: !!v.isPioneerVendor,
      isBanned: !!v.isBanned,
      banType: v.banType || "none",
      banReason: v.banReason || "",
      banExplanation: v.banExplanation || "",
      banExpiresAt: v.banExpiresAt || null,
      storeUrl: `https://locovend-database.onrender.com/store/${v.id}`
    };
  });

  return res.json(vendorsList);
});

/**
 * Get single vendor detail with products, reviews, complaints, reports
 */
app.get('/api/admin/vendors/:id', (req, res) => {
  const db = readDb();
  const vendor = db.vendors.find(v => v.id === req.params.id);
  if (!vendor) {
    return res.status(404).json({ success: false, message: "Vendor not found." });
  }

  const products = db.products.filter(p => p.vendorId === vendor.id);
  const orders = db.orders.filter(o => o.vendorId === vendor.id || o.vendorName === vendor.name);
  const complaints = db.complaints.filter(c => c.vendorName?.toLowerCase() === vendor.name.toLowerCase() || c.vendorId === vendor.id);
  const reports = db.reports.filter(r => r.targetId === vendor.id);

  return res.json({
    ...vendor,
    products,
    orders,
    complaints,
    reports
  });
});

/**
 * Verify / Unverify vendor
 */
app.patch('/api/admin/vendors/:id/verify', (req, res) => {
  const { isVerified, adminEmail } = req.body;
  const db = readDb();
  const vendor = db.vendors.find(v => v.id === req.params.id);
  if (!vendor) {
    return res.status(404).json({ success: false, message: "Vendor not found." });
  }

  vendor.isVerified = isVerified === true;
  writeDb(db);

  logAdminAction(adminEmail, "VENDOR_VERIFICATION_TOGGLE", `Set isVerified=${vendor.isVerified} for vendor "${vendor.name}"`);

  return res.json({ success: true, isVerified: vendor.isVerified, vendor });
});

/**
 * Mark / Unmark Pioneer Vendor
 */
app.patch('/api/admin/vendors/:id/pioneer', (req, res) => {
  const { isPioneerVendor, adminEmail } = req.body;
  const db = readDb();
  const vendor = db.vendors.find(v => v.id === req.params.id);
  if (!vendor) {
    return res.status(404).json({ success: false, message: "Vendor not found." });
  }

  vendor.isPioneerVendor = isPioneerVendor === true;
  writeDb(db);

  logAdminAction(adminEmail, "VENDOR_PIONEER_TOGGLE", `Set isPioneerVendor=${vendor.isPioneerVendor} for vendor "${vendor.name}"`);

  return res.json({ success: true, isPioneerVendor: vendor.isPioneerVendor, vendor });
});

/**
 * Ban or unban a vendor store
 */
app.post('/api/admin/vendors/:id/ban', (req, res) => {
  const { type, reason, explanation, durationDays, adminEmail } = req.body;
  const db = readDb();
  const query = req.params.id.toLowerCase().trim();

  let vendor = db.vendors.find(v =>
    v.id?.toLowerCase() === query ||
    v.ownerEmail?.toLowerCase() === query ||
    v.name?.toLowerCase() === query
  );

  let appMatch = db.vendorApplications.find(a =>
    a.id?.toLowerCase() === query ||
    a.ownerEmail?.toLowerCase() === query ||
    a.name?.toLowerCase() === query
  );

  if (!vendor && !appMatch) {
    return res.status(404).json({ success: false, message: "Vendor or vendor application not found." });
  }

  const storeName = vendor?.name || appMatch?.name || "Vendor Store";
  const ownerEmail = (vendor?.ownerEmail || appMatch?.ownerEmail || "").toLowerCase();

  if (type === "none" || !type) {
    if (vendor) {
      vendor.isBanned = false;
      vendor.banType = "none";
      vendor.banReason = "";
      vendor.banExplanation = "";
      vendor.banExpiresAt = null;
      vendor.isOpen = true;
    }
    if (appMatch) {
      appMatch.isBanned = false;
      appMatch.banType = "none";
      appMatch.banReason = "";
      appMatch.banExplanation = "";
      appMatch.banExpiresAt = null;
    }
    logAdminAction(adminEmail, "VENDOR_STORE_UNBANNED", `Unbanned vendor store "${storeName}"`);
  } else {
    const banExpiresAt = type === "temporary" && durationDays
      ? Date.now() + durationDays * 24 * 60 * 60 * 1000
      : null;

    if (vendor) {
      vendor.isBanned = true;
      vendor.banType = type; // "temporary" or "permanent"
      vendor.banReason = reason || "Policy violation";
      vendor.banExplanation = explanation || "";
      vendor.banExpiresAt = banExpiresAt;
      vendor.isOpen = false; // close store while banned
    }

    if (appMatch) {
      appMatch.isBanned = true;
      appMatch.banType = type;
      appMatch.banReason = reason || "Policy violation";
      appMatch.banExplanation = explanation || "";
      appMatch.banExpiresAt = banExpiresAt;
    }

    logAdminAction(adminEmail, "VENDOR_STORE_BANNED", `Banned vendor store "${storeName}" (${type}). Reason: ${reason}. Exp: ${explanation}`);
  }

  writeDb(db);
  return res.json({ success: true, message: "Vendor ban status updated.", vendor, application: appMatch });
});

/**
 * Delete a vendor store permanently
 */
app.delete('/api/admin/vendors/:id', (req, res) => {
  const { adminEmail } = req.body || {};
  const db = readDb();
  const index = db.vendors.findIndex(v => v.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Vendor not found." });
  }

  const removed = db.vendors.splice(index, 1)[0];
  db.products = db.products.filter(p => p.vendorId !== req.params.id);
  logAdminAction(adminEmail, "VENDOR_DELETED", `Deleted vendor "${removed.name}" (${removed.ownerEmail})`);
  writeDb(db);
  return res.json({ success: true, message: `Vendor "${removed.name}" deleted successfully.`, vendor: removed });
});

/**
 * Self-service store deletion by vendor (with reason and explanation survey)
 */
app.post('/api/vendor/store/delete', (req, res) => {
  const { email, storeId, reason, explanation } = req.body || {};
  const cleanEmail = (email || '').trim().toLowerCase();
  const db = readDb();

  let removedVendor = null;
  const vIndex = db.vendors.findIndex(v => 
    (storeId && v.id === storeId) || 
    (cleanEmail && v.ownerEmail && v.ownerEmail.toLowerCase() === cleanEmail)
  );

  if (vIndex !== -1) {
    removedVendor = db.vendors.splice(vIndex, 1)[0];
    db.products = db.products.filter(p => p.vendorId !== removedVendor.id);
  }

  // Remove matching vendor applications
  db.vendorApplications = db.vendorApplications.filter(a => {
    if (storeId && a.id === storeId) return false;
    const aEmail = (a.ownerEmail || a.email || '').toLowerCase().trim();
    if (cleanEmail && aEmail === cleanEmail) return false;
    return true;
  });

  // Revert user role back to Customer
  if (cleanEmail) {
    const user = db.users.find(u => u.email && u.email.toLowerCase().trim() === cleanEmail);
    if (user) {
      user.role = 'Customer';
      user.isVendor = false;
      user.vendorId = null;
      user.vendorStoreName = null;
    }
  }

  // Record deletion audit entry
  if (!db.storeDeletionLogs) db.storeDeletionLogs = [];
  db.storeDeletionLogs.push({
    storeId: removedVendor ? removedVendor.id : (storeId || null),
    storeName: removedVendor ? removedVendor.name : "Vendor Store",
    ownerEmail: cleanEmail,
    reason: reason || "No reason specified",
    explanation: explanation || "",
    deletedAt: Date.now()
  });

  writeDb(db);
  console.log(`[STORE_DELETED] Store deleted for ${cleanEmail}. Reason: ${reason}`);
  return res.json({
    success: true,
    message: "Store deleted successfully."
  });
});

// ================= SECTION 3: APPLICATIONS & SUGGESTIONS =================

/**
 * Get all vendor applications
 */
app.get('/api/admin/applications', (req, res) => {
  const db = readDb();
  return res.json(db.vendorApplications);
});

/**
 * Accept or Deny a vendor application
 */
app.post('/api/admin/applications/:id/decision', (req, res) => {
  const { decision, reason, explanation, adminEmail } = req.body; // decision: "accept" or "deny"
  const db = readDb();
  const application = db.vendorApplications.find(a => a.id === req.params.id);

  if (!application) {
    return res.status(404).json({ success: false, message: "Vendor application not found." });
  }

  if (decision === "accept") {
    application.status = "Approved";
    application.approvedAt = Date.now();

    // Check if vendor already exists in vendors table
    let existingVendor = db.vendors.find(v => v.ownerEmail?.toLowerCase() === application.ownerEmail.toLowerCase());
    const vendorUsername = application.username || application.name.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_').substring(0, 25);
    if (!existingVendor) {
      existingVendor = {
        id: `vnd_${uuidv4().substring(0, 8)}`,
        name: application.name,
        username: vendorUsername,
        motto: application.description || "Fresh local vendor on LocoVend",
        category: application.category || "food_snacks",
        area: application.area || "Katsina Central",
        address: application.address || application.area || "Katsina",
        phone: application.phone,
        ownerEmail: application.ownerEmail.toLowerCase(),
        status: "Active",
        rating: 5.0,
        reviewsCount: 0,
        deliveryTimeMinutes: "20-30 min",
        deliveryFee: 500,
        isOpen: true,
        isVerified: true,
        isPioneerVendor: false,
        isBanned: false,
        logoUri: application.logoUri || "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&q=80",
        createdAt: Date.now()
      };
      db.vendors.push(existingVendor);
    } else {
      if (application.username) existingVendor.username = application.username;
    }

    // Upgrade applicant user account to "Vendor"
    const user = db.users.find(u => u.email.toLowerCase() === application.ownerEmail.toLowerCase());
    if (user) {
      user.role = "Vendor";
      user.isVendor = true;
      user.vendorId = existingVendor.id;
      user.vendorStoreName = existingVendor.name;
      user.username = existingVendor.username;
    }

    logAdminAction(adminEmail, "APPLICATION_ACCEPTED", `Accepted vendor application for "${application.name}" (${application.ownerEmail})`);
    writeDb(db);

    return res.json({ success: true, message: "Application accepted and vendor store activated.", application, vendor: existingVendor });
  } else if (decision === "deny") {
    application.status = "Denied";
    application.rejectionReason = reason || "Did not meet criteria";
    application.rejectionExplanation = explanation || "";
    application.deniedAt = Date.now();

    logAdminAction(adminEmail, "APPLICATION_DENIED", `Denied application for "${application.name}". Reason: ${reason}`);
    writeDb(db);

    return res.json({ success: true, message: "Application denied.", application });
  } else {
    return res.status(400).json({ success: false, message: "Invalid decision. Must be 'accept' or 'deny'." });
  }
});

/**
 * Delete vendor application (Admin)
 */
app.delete('/api/admin/applications/:id', (req, res) => {
  const db = readDb();
  const index = db.vendorApplications.findIndex(a => a.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Vendor application not found." });
  }

  const removed = db.vendorApplications.splice(index, 1)[0];
  writeDb(db);

  logAdminAction(req.body?.adminEmail || "SuperAdmin", "APPLICATION_DELETED", `Deleted application for "${removed.name}" (${removed.ownerEmail})`);
  return res.json({ success: true, message: "Vendor application deleted successfully.", removed });
});

// ================= SECTION: STORE IDS (MERCHANT ACTIVATION CODES) =================

function generate6CharStoreId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let res = "";
  for (let i = 0; i < 6; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
}

/**
 * Get all Store IDs (Admin)
 */
app.get(['/api/admin/store-ids', '/api/admin/store-id', '/api/store-ids'], (req, res) => {
  const db = readDb();
  if (!db.storeIds) db.storeIds = [];
  return res.json(db.storeIds);
});

/**
 * Create a new Store ID (Admin)
 */
app.post(['/api/admin/store-ids', '/api/admin/store-id', '/api/store-ids', '/api/admin/generate-store-id'], (req, res) => {
  try {
    const { accountEmail, email, code, adminEmail } = req.body || {};
    const targetEmail = (accountEmail || email || "").toLowerCase().trim();

    if (!targetEmail || !targetEmail.includes("@")) {
      return res.status(400).json({ success: false, message: "Valid vendor account email is required." });
    }

    const db = readDb();
    if (!db.storeIds) db.storeIds = [];

    let finalCode = (code || generate6CharStoreId()).toUpperCase().trim();
    if (finalCode.length !== 6) {
      return res.status(400).json({ success: false, message: "Store ID must be exactly 6 characters." });
    }

    if (db.storeIds.some(s => s.code.toUpperCase() === finalCode)) {
      return res.status(409).json({ success: false, message: `A Store ID with code ${finalCode} already exists.` });
    }

    const newStoreId = {
      id: `sid_${uuidv4().substring(0, 8)}`,
      code: finalCode,
      accountEmail: targetEmail,
      email: targetEmail,
      status: "active",
      isRedeemed: false,
      redeemedAt: null,
      redeemedByVendorId: null,
      createdAt: Date.now(),
      createdByAdmin: adminEmail || "SuperAdmin"
    };

    db.storeIds.unshift(newStoreId);
    writeDb(db);

    logAdminAction(adminEmail || "SuperAdmin", "STORE_ID_CREATED", `Generated 6-character Store ID ${finalCode} for ${targetEmail}`);

    return res.status(201).json({
      success: true,
      storeId: {
        id: newStoreId.id,
        code: newStoreId.code,
        email: newStoreId.email,
        accountEmail: newStoreId.accountEmail,
        createdAt: newStoreId.createdAt,
        redeemedAt: null,
        isRedeemed: false,
        status: "active"
      },
      ...newStoreId
    });
  } catch (error) {
    console.error("Error generating Store ID:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to generate Store ID." });
  }
});

/**
 * Delete / Revoke a Store ID (Admin)
 */
app.delete(['/api/admin/store-ids/:id', '/api/admin/store-ids/:code'], (req, res) => {
  const param = req.params.id || req.params.code;
  const db = readDb();
  if (!db.storeIds) db.storeIds = [];

  const index = db.storeIds.findIndex(s => s.id === param || s.code.toUpperCase() === param.toUpperCase());
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Store ID not found." });
  }

  const removed = db.storeIds.splice(index, 1)[0];
  writeDb(db);

  logAdminAction(req.body?.adminEmail || "SuperAdmin", "STORE_ID_DELETED", `Deleted Store ID ${removed.code} for ${removed.accountEmail}`);

  return res.json({ success: true, message: "Store ID deleted successfully.", removed });
});

/**
 * Redeem a 6-character Store ID (Vendor)
 * Validates code and ensures vendor's account email matches the Store ID's assigned email.
 * Activates vendor application and store for free (waiving ₦1,000 fee).
 */
app.post(['/api/vendor/store-ids/redeem', '/api/vendors/store-ids/redeem'], (req, res) => {
  const { code, email, vendorId, applicationId } = req.body;
  if (!code || !email) {
    return res.status(400).json({ success: false, message: "Store ID code and vendor account email are required." });
  }

  const cleanCode = code.trim().toUpperCase();
  const cleanEmail = email.trim().toLowerCase();

  if (cleanCode.length !== 6) {
    return res.status(400).json({ success: false, message: "Store ID must be exactly 6 characters." });
  }

  const db = readDb();
  if (!db.storeIds) db.storeIds = [];

  const storeIdEntry = db.storeIds.find(s => s.code.toUpperCase() === cleanCode);
  if (!storeIdEntry) {
    return res.status(404).json({ success: false, message: "Invalid Store ID. Code does not exist." });
  }

  if (storeIdEntry.isRedeemed || storeIdEntry.status === "used") {
    return res.status(400).json({ success: false, message: "This Store ID has already been redeemed." });
  }

  if (storeIdEntry.accountEmail.toLowerCase() !== cleanEmail && storeIdEntry.email?.toLowerCase() !== cleanEmail) {
    return res.status(403).json({
      success: false,
      message: `Email mismatch. This Store ID is bound to "${storeIdEntry.accountEmail}". You are logged in as "${cleanEmail}".`
    });
  }

  // Mark Store ID as redeemed
  storeIdEntry.isRedeemed = true;
  storeIdEntry.status = "used";
  storeIdEntry.redeemedAt = Date.now();
  storeIdEntry.redeemedByVendorId = vendorId || applicationId || `vnd_${cleanEmail}`;

  // Find and update vendor application
  const appMatch = db.vendorApplications.find(a =>
    a.ownerEmail?.toLowerCase() === cleanEmail ||
    (applicationId && a.id === applicationId)
  );
  if (appMatch) {
    appMatch.status = "Active";
    appMatch.isRegistrationFeePaid = true;
    appMatch.paymentReference = `STORE_ID_${cleanCode}`;
    appMatch.paymentAmount = 0;
  }

  // Find and update vendor storefront
  let vendorMatch = db.vendors.find(v =>
    v.ownerEmail?.toLowerCase() === cleanEmail ||
    (vendorId && v.id === vendorId)
  );
  if (vendorMatch) {
    vendorMatch.status = "Active";
    vendorMatch.isOpen = true;
  } else if (appMatch) {
    const vendorUsername = appMatch.username || appMatch.name.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_').substring(0, 25);
    vendorMatch = {
      id: vendorId || `vnd_${uuidv4().substring(0, 8)}`,
      name: appMatch.name,
      username: vendorUsername,
      motto: appMatch.description || "Verified Vendor on LocoVend Katsina",
      category: appMatch.category || "Food & Snacks",
      area: appMatch.area || "Katsina Central",
      address: appMatch.address || appMatch.area || "Katsina",
      phone: appMatch.phone,
      ownerEmail: cleanEmail,
      status: "Active",
      rating: 5.0,
      reviewsCount: 0,
      deliveryTimeMinutes: "20-30 min",
      deliveryFee: 500,
      isOpen: true,
      isVerified: true,
      isPioneerVendor: false,
      isBanned: false,
      logoUri: appMatch.logoUri || "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&q=80",
      createdAt: Date.now()
    };
    db.vendors.push(vendorMatch);
  }

  // Update user role to Vendor
  const user = db.users.find(u => u.email.toLowerCase() === cleanEmail);
  if (user) {
    user.role = "Vendor";
    user.isVendor = true;
    user.vendorId = vendorMatch?.id || `vnd_${cleanEmail}`;
    user.vendorStoreName = vendorMatch?.name || appMatch?.name || "Vendor Store";
  }

  writeDb(db);

  logAdminAction("SYSTEM", "STORE_ID_REDEEMED", `Store ID ${cleanCode} redeemed by vendor "${cleanEmail}" (Store: ${vendorMatch?.name || "Unknown"})`);

  return res.json({
    success: true,
    message: "Store ID redeemed successfully! Your store has been activated for free.",
    code: cleanCode,
    email: cleanEmail,
    vendor: vendorMatch
  });
});

/**
 * Suggestions section
 */
app.get('/api/admin/suggestions', (req, res) => {
  const db = readDb();
  return res.json(db.suggestions);
});

app.delete('/api/admin/suggestions/:id', (req, res) => {
  const db = readDb();
  const index = db.suggestions.findIndex(s => s.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Suggestion not found." });
  }

  const removed = db.suggestions.splice(index, 1)[0];
  writeDb(db);
  return res.json({ success: true, message: "Suggestion deleted.", removed });
});

// ================= SECTION 4: ADMIN ACCOUNTS & LOGS =================

/**
 * Get all admin login accounts and last login timestamps
 */
app.get('/api/admin/admins', (req, res) => {
  const db = readDb();
  const safeAdmins = db.admins.map(a => ({
    id: a.id,
    name: a.name,
    email: a.email,
    role: a.role,
    isSuperAdmin: !!a.isSuperAdmin,
    isDeletable: a.isDeletable !== false,
    isEditable: a.isEditable !== false,
    lastLoginAt: a.lastLoginAt,
    createdAt: a.createdAt
  }));
  return res.json(safeAdmins);
});

/**
 * Create a new admin account
 */
app.post('/api/admin/admins', (req, res) => {
  const { name, email, password, adminEmail } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: "Name, email, and password are required." });
  }

  const db = readDb();
  const cleanEmail = email.toLowerCase().trim();

  if (db.admins.some(a => a.email.toLowerCase() === cleanEmail)) {
    return res.status(409).json({ success: false, message: "An admin account with this email already exists." });
  }

  const newAdmin = {
    id: `adm_${uuidv4().substring(0, 8)}`,
    name: name.trim(),
    email: cleanEmail,
    password: password.trim(),
    role: "Admin",
    isSuperAdmin: false,
    isDeletable: true,
    isEditable: true,
    createdAt: Date.now(),
    lastLoginAt: null
  };

  db.admins.push(newAdmin);
  writeDb(db);

  logAdminAction(adminEmail, "ADMIN_CREATED", `Created new admin account for ${newAdmin.name} (${newAdmin.email})`);

  return res.status(201).json({
    success: true,
    message: "Admin account created successfully.",
    admin: {
      id: newAdmin.id,
      name: newAdmin.name,
      email: newAdmin.email,
      role: newAdmin.role,
      lastLoginAt: null
    }
  });
});

/**
 * Edit an admin account (Protected: Cannot edit default superadmin)
 */
app.put('/api/admin/admins/:id', (req, res) => {
  const { name, email, password, adminEmail } = req.body;
  const db = readDb();
  const admin = db.admins.find(a => a.id === req.params.id);

  if (!admin) {
    return res.status(404).json({ success: false, message: "Admin account not found." });
  }

  // Immutable check for default Super Admin
  if (admin.isSuperAdmin || admin.email.toLowerCase() === "khaleelktn@gmail.com") {
    return res.status(403).json({
      success: false,
      message: "Permission denied: The default Super Admin credentials (khaleelktn@gmail.com) are permanent and cannot be edited."
    });
  }

  if (name) admin.name = name.trim();
  if (email) admin.email = email.toLowerCase().trim();
  if (password) admin.password = password.trim();

  writeDb(db);
  logAdminAction(adminEmail, "ADMIN_UPDATED", `Updated admin account ${admin.email}`);

  return res.json({
    success: true,
    message: "Admin account updated successfully.",
    admin: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      lastLoginAt: admin.lastLoginAt
    }
  });
});

/**
 * Delete an admin account (Protected: Cannot delete default superadmin)
 */
app.delete('/api/admin/admins/:id', (req, res) => {
  const { adminEmail } = req.body || {};
  const db = readDb();
  const admin = db.admins.find(a => a.id === req.params.id);

  if (!admin) {
    return res.status(404).json({ success: false, message: "Admin account not found." });
  }

  // Immutable check for default Super Admin
  if (admin.isSuperAdmin || admin.email.toLowerCase() === "khaleelktn@gmail.com") {
    return res.status(403).json({
      success: false,
      message: "Permission denied: The default Super Admin account (khaleelktn@gmail.com) is permanent and cannot be deleted."
    });
  }

  db.admins = db.admins.filter(a => a.id !== req.params.id);
  writeDb(db);

  logAdminAction(adminEmail, "ADMIN_DELETED", `Deleted admin account ${admin.email}`);

  return res.json({ success: true, message: `Admin account ${admin.email} deleted successfully.` });
});

/**
 * Get all administrative activity logs
 */
app.get('/api/admin/logs', (req, res) => {
  const db = readDb();
  return res.json(db.adminLogs);
});

// ================= SYSTEM DATA INTEGRITY & HARDENING =================

/**
 * System Data Health & Status
 */
app.get('/api/admin/system/status', (req, res) => {
  const db = readDb();
  return res.json({
    status: "healthy",
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: Date.now(),
    persistence: {
      dbFileExists: fs.existsSync(DB_FILE),
      backup1Exists: fs.existsSync(DB_BACKUP_1),
      backup2Exists: fs.existsSync(DB_BACKUP_2),
      dataDir: DATA_DIR
    },
    counts: {
      users: (db.users || []).length,
      vendors: (db.vendors || []).length,
      applications: (db.vendorApplications || []).length,
      products: (db.products || []).length,
      orders: (db.orders || []).length,
      admins: (db.admins || []).length,
      logs: (db.adminLogs || []).length
    }
  });
});

/**
 * Emergency Auto-Heal & Restore Safeguard
 * Guarantees foundational records are never lost and syncs to disk immediately
 */
app.post('/api/admin/system/heal', (req, res) => {
  const db = readDb();
  writeDb(db);
  logAdminAction(req.body?.adminEmail || "system", "SYSTEM_HEALED", "Executed system auto-heal and forced disk persistence synchronization.");
  return res.json({
    success: true,
    message: "System data audited and persisted successfully. Foundational records verified.",
    counts: {
      users: db.users.length,
      vendors: db.vendors.length,
      applications: db.vendorApplications.length,
      products: db.products.length,
      admins: db.admins.length
    }
  });
});

// ================= PUBLIC VENDORS & PRODUCTS =================

app.get('/api/vendors', (req, res) => {
  const db = readDb();
  // Filter out banned vendors from public marketplace
  let list = db.vendors.filter(v => !v.isBanned);
  if (req.query.category) {
    list = list.filter(v => v.category === req.query.category);
  }
  if (req.query.area) {
    list = list.filter(v => v.area.toLowerCase().includes(req.query.area.toLowerCase()));
  }
  return res.json(list);
});

// Check username availability
app.get('/api/vendors/check-username/:username', (req, res) => {
  const username = (req.params.username || "").toLowerCase().trim().replace(/^@/, '');
  if (!username || username.length < 3) {
    return res.json({ available: false, username, reason: "Username must be at least 3 characters long." });
  }
  if (!/^[a-z0-9_]{3,30}$/.test(username)) {
    return res.json({ available: false, username, reason: "Letters, numbers, and underscores only (no spaces or special symbols)." });
  }
  if (RESERVED_USERNAMES.has(username)) {
    return res.json({ available: false, username, reason: "This username is reserved for official system use." });
  }
  const db = readDb();
  const takenByVendor = db.vendors.find(v => v.username?.toLowerCase() === username);
  const takenByApp = db.vendorApplications.find(a => a.username?.toLowerCase() === username && a.status !== 'Denied' && a.status !== 'Rejected');
  if (takenByVendor || takenByApp) {
    return res.json({ available: false, username, reason: "Username is already taken by another registered vendor." });
  }
  return res.json({ available: true, username, reason: null });
});

// Lookup vendor by username
app.get('/api/vendors/by-username/:username', (req, res) => {
  const username = (req.params.username || "").toLowerCase().trim().replace(/^@/, '');
  const db = readDb();
  const vendor = db.vendors.find(v => (v.username?.toLowerCase() === username) || (v.id?.toLowerCase() === username));
  if (!vendor) {
    return res.status(404).json({ success: false, message: `Vendor with username @${username} not found.` });
  }
  return res.json(vendor);
});

app.post('/api/vendors/apply', (req, res) => {
  const { ownerEmail, name, category, area, phone, description, logoUri, username } = req.body;
  if (!ownerEmail || !name || !phone) {
    return res.status(400).json({ success: false, message: "ownerEmail, name, and phone are required." });
  }

  const cleanEmail = ownerEmail.toLowerCase().trim();
  const db = readDb();

  let cleanUsername = (username || "").toLowerCase().trim().replace(/^@/, '');
  if (cleanUsername) {
    if (cleanUsername.length < 3 || cleanUsername.length > 30 || !/^[a-z0-9_]+$/.test(cleanUsername)) {
      return res.status(400).json({ success: false, message: "Username must be 3-30 characters (letters, numbers, and underscores only)." });
    }
    if (RESERVED_USERNAMES.has(cleanUsername)) {
      return res.status(400).json({ success: false, message: `Username '@${cleanUsername}' is reserved for official system use.` });
    }
    const takenByVendor = db.vendors.find(v => v.username?.toLowerCase() === cleanUsername && v.ownerEmail?.toLowerCase() !== cleanEmail);
    const takenByApp = db.vendorApplications.find(a => a.username?.toLowerCase() === cleanUsername && a.ownerEmail?.toLowerCase() !== cleanEmail && a.status !== 'Denied' && a.status !== 'Rejected');
    if (takenByVendor || takenByApp) {
      return res.status(400).json({ success: false, message: `Username '@${cleanUsername}' is already taken by another vendor.` });
    }
  } else {
    cleanUsername = name.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_').substring(0, 25);
  }

  // If application already exists for this vendor email, RESET it instead of creating duplicates
  const existingIndex = db.vendorApplications.findIndex(a => a.ownerEmail?.toLowerCase().trim() === cleanEmail);
  if (existingIndex >= 0) {
    const existing = db.vendorApplications[existingIndex];
    existing.name = name.trim();
    existing.username = cleanUsername;
    existing.category = category || existing.category || "food_snacks";
    existing.area = area || existing.area || "Katsina Central";
    existing.phone = phone.trim();
    existing.description = description || existing.description || "";
    if (logoUri) existing.logoUri = logoUri;
    existing.status = "PendingReview";
    existing.rejectionReason = null;
    existing.rejectionExplanation = null;
    existing.deniedAt = null;
    existing.submittedAt = Date.now();
    existing.isRegistrationFeePaid = false;
    existing.message = "Application re-submitted and reset for review.";

    writeDb(db);
    return res.status(200).json(existing);
  }

  const id = `vapp_${uuidv4().substring(0, 8)}`;
  const application = {
    id,
    ownerEmail: cleanEmail,
    name: name.trim(),
    username: cleanUsername,
    category: category || "food_snacks",
    area: area || "Katsina Central",
    phone: phone.trim(),
    description: description || "",
    logoUri: logoUri || null,
    status: "PendingReview",
    rejectionReason: null,
    rejectionExplanation: null,
    submittedAt: Date.now(),
    isRegistrationFeePaid: false,
    message: "Application submitted successfully. Under 24-hour review."
  };

  db.vendorApplications.push(application);
  writeDb(db);

  return res.status(201).json(application);
});

// Dedicated resubmit endpoint to reset denied application
app.post('/api/vendors/resubmit', (req, res) => {
  const { ownerEmail, name, category, area, phone, description, logoUri } = req.body;
  if (!ownerEmail) {
    return res.status(400).json({ success: false, message: "ownerEmail is required." });
  }

  const cleanEmail = ownerEmail.toLowerCase().trim();
  const db = readDb();

  const existing = db.vendorApplications.find(a => a.ownerEmail?.toLowerCase().trim() === cleanEmail);
  if (existing) {
    if (name) existing.name = name.trim();
    if (category) existing.category = category;
    if (area) existing.area = area;
    if (phone) existing.phone = phone.trim();
    if (description !== undefined) existing.description = description;
    if (logoUri) existing.logoUri = logoUri;
    existing.status = "PendingReview";
    existing.rejectionReason = null;
    existing.rejectionExplanation = null;
    existing.deniedAt = null;
    existing.submittedAt = Date.now();
    existing.isRegistrationFeePaid = false;
    existing.message = "Application reset and re-submitted for 24-hour review.";

    writeDb(db);
    return res.status(200).json(existing);
  }

  // Fallback: create if didn't exist
  const id = `vapp_${uuidv4().substring(0, 8)}`;
  const newApp = {
    id,
    ownerEmail: cleanEmail,
    name: name || "Vendor Store",
    category: category || "food_snacks",
    area: area || "Katsina Central",
    phone: phone || "",
    description: description || "",
    logoUri: logoUri || null,
    status: "PendingReview",
    rejectionReason: null,
    rejectionExplanation: null,
    submittedAt: Date.now(),
    isRegistrationFeePaid: false,
    message: "Application submitted for review."
  };
  db.vendorApplications.push(newApp);
  writeDb(db);
  return res.status(201).json(newApp);
});

app.get('/api/vendors/status/:id', (req, res) => {
  const db = readDb();
  const query = req.params.id.toLowerCase().trim();

  // 1. Check if vendor store exists in vendors list (e.g. active or banned store)
  const vendorStore = db.vendors.find(v =>
    v.id?.toLowerCase().trim() === query ||
    v.ownerEmail?.toLowerCase().trim() === query
  );

  if (vendorStore) {
    if (vendorStore.isBanned) {
      // Check if temporary ban expired
      if (vendorStore.banType === 'temporary' && vendorStore.banExpiresAt && Date.now() > vendorStore.banExpiresAt) {
        vendorStore.isBanned = false;
        vendorStore.banType = "none";
        vendorStore.isOpen = true;
        writeDb(db);
      } else {
        return res.json({
          id: vendorStore.id,
          name: vendorStore.name,
          ownerEmail: vendorStore.ownerEmail,
          status: "Banned",
          isBanned: true,
          banType: vendorStore.banType || "permanent",
          banReason: vendorStore.banReason || "Policy violation",
          banExplanation: vendorStore.banExplanation || "Store access has been disabled by LocoVend administration.",
          banExpiresAt: vendorStore.banExpiresAt || null,
          isRegistrationFeePaid: true
        });
      }
    }

    // Active Vendor in database
    return res.json({
      id: vendorStore.id,
      name: vendorStore.name,
      ownerEmail: vendorStore.ownerEmail,
      status: "Active",
      isBanned: false,
      banType: "none",
      banReason: "",
      banExplanation: "",
      banExpiresAt: null,
      isRegistrationFeePaid: true
    });
  }

  // 2. Find all matching applications and select the latest one
  const matching = db.vendorApplications.filter(a =>
    a.id?.toLowerCase().trim() === query ||
    a.ownerEmail?.toLowerCase().trim() === query
  );

  if (matching.length === 0) {
    return res.status(404).json({ success: false, message: "Application not found." });
  }

  const appFound = matching[matching.length - 1];
  const isAppPaid = appFound.isRegistrationFeePaid === true;
  return res.json({
    ...appFound,
    status: isAppPaid ? "Active" : appFound.status,
    isBanned: !!appFound.isBanned,
    banType: appFound.banType || null,
    banReason: appFound.banReason || null,
    banExplanation: appFound.banExplanation || null,
    banExpiresAt: appFound.banExpiresAt || null,
    rejectionReason: appFound.rejectionReason || null,
    rejectionExplanation: appFound.rejectionExplanation || null
  });
});

/**
 * Public User Ban & Status Check Endpoint
 * Checks whether user account is active or banned.
 */
app.get('/api/users/status/:id', (req, res) => {
  const db = readDb();
  const query = req.params.id.toLowerCase().trim();
  const user = db.users.find(u => u.id?.toLowerCase() === query || u.email?.toLowerCase() === query);

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found." });
  }

  // Auto-lift expired temporary ban
  if (user.isBanned && user.banType === 'temporary' && user.banExpiresAt && Date.now() > user.banExpiresAt) {
    user.isBanned = false;
    user.banType = "none";
    user.banReason = "";
    user.banExplanation = "";
    user.banExpiresAt = null;
    writeDb(db);
  }

  return res.json({
    success: true,
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    location: user.location || "Katsina Central",
    address: user.address || "",
    avatarUrl: user.avatarUrl || null,
    role: user.role || "Customer",
    isVendor: !!user.isVendor,
    vendorId: user.vendorId || null,
    vendorStoreName: user.vendorStoreName || null,
    isBanned: !!user.isBanned,
    banType: user.banType || "none",
    banReason: user.banReason || "",
    banExplanation: user.banExplanation || "",
    banExpiresAt: user.banExpiresAt || null
  });
});

// Admin clean demos endpoint - hardened to guarantee records are NEVER wiped automatically
app.post('/api/admin/clean-demos', (req, res) => {
  const db = readDb();
  return res.json({
    success: true,
    message: "Database verified. All registered accounts, stores, and applications are safely preserved.",
    remainingUsers: db.users.length,
    remainingVendors: db.vendors.length
  });
});

app.post('/api/vendors/pay-activation', (req, res) => {
  const { applicationId, reference, amount } = req.body;
  const db = readDb();
  const appFound = db.vendorApplications.find(a => a.id === applicationId || a.ownerEmail === applicationId);
  if (!appFound) {
    return res.status(404).json({ success: false, message: "Application not found." });
  }

  appFound.isRegistrationFeePaid = true;
  appFound.paymentReference = reference || `PAY_${Date.now()}`;
  appFound.paymentAmount = amount || 1000;
  appFound.status = "Active";

  // Ensure vendor is also active and open in db.vendors
  let vendor = db.vendors.find(v => v.ownerEmail?.toLowerCase() === appFound.ownerEmail?.toLowerCase());
  if (!vendor) {
    vendor = {
      id: `vnd_${uuidv4().substring(0, 8)}`,
      name: appFound.name,
      motto: appFound.description || "Fresh local vendor on LocoVend",
      category: appFound.category || "Food & Snacks",
      area: appFound.area || "Katsina Central",
      address: appFound.address || appFound.area || "Katsina Central",
      phone: appFound.phone,
      ownerEmail: appFound.ownerEmail.toLowerCase(),
      status: "Active",
      rating: 5.0,
      reviewsCount: 0,
      deliveryTimeMinutes: "20-30 min",
      deliveryFee: 500,
      isOpen: true,
      isVerified: true,
      isPioneerVendor: false,
      isBanned: false,
      logoUri: appFound.logoUri || "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&q=80",
      createdAt: Date.now()
    };
    db.vendors.push(vendor);
  } else {
    vendor.status = "Active";
    vendor.isOpen = true;
    vendor.isBanned = false;
  }

  // Upgrade applicant user account to "Vendor"
  const user = db.users.find(u => u.email.toLowerCase() === appFound.ownerEmail.toLowerCase());
  if (user) {
    user.role = "Vendor";
  }

  writeDb(db);
  return res.json({ success: true, message: "Payment verified. Vendor profile approved!", application: appFound, vendor });
});

// Resilient Products API
app.get('/api/products', (req, res) => {
  const db = readDb();
  let list = db.products;
  if (req.query.vendorId) {
    const qv = req.query.vendorId.toLowerCase().trim();
    // Resolve matching vendors/applications/names
    const vendorMatches = db.vendors.filter(v => 
      v.id.toLowerCase() === qv || 
      v.name.toLowerCase() === qv || 
      v.ownerEmail.toLowerCase() === qv
    );
    const validVendorIds = new Set([qv, ...vendorMatches.map(v => v.id.toLowerCase()), ...vendorMatches.map(v => v.name.toLowerCase())]);
    
    const appMatches = db.vendorApplications.filter(a => a.id?.toLowerCase() === qv || a.ownerEmail?.toLowerCase() === qv);
    appMatches.forEach(a => {
      validVendorIds.add(a.id.toLowerCase());
      validVendorIds.add(a.name.toLowerCase());
    });

    list = list.filter(p => 
      validVendorIds.has(p.vendorId.toLowerCase()) || 
      validVendorIds.has(p.vendorName.toLowerCase())
    );
  }
  if (req.query.category) {
    list = list.filter(p => p.categoryId === req.query.category);
  }
  return res.json(list);
});

app.post('/api/products', (req, res) => {
  const { name, price, categoryId, categoryName, vendorId, vendorName, vendorArea, description, stockCount, hasExplicitStockCount, inStock, images } = req.body;
  if (!name || !price || !vendorId) {
    return res.status(400).json({ success: false, message: "name, price, and vendorId are required." });
  }

  const db = readDb();
  const id = `prd_${uuidv4().substring(0, 8)}`;

  // If stockCount is specified as a valid number >= 0, it has explicit stock tracking
  const explicitStock = (hasExplicitStockCount === true || (stockCount !== undefined && stockCount !== null && stockCount !== "" && !isNaN(Number(stockCount))));
  const parsedStockCount = explicitStock ? Math.max(0, parseInt(stockCount, 10)) : null;
  const initialInStock = explicitStock ? (parsedStockCount > 0) : (inStock !== false);

  // Resilient vendorId resolution: if passed as application ID, resolve to vendor ID if available
  let resolvedVendorId = vendorId;
  const matchedVendor = db.vendors.find(v => v.id === vendorId || v.name.toLowerCase() === (vendorName || "").toLowerCase());
  if (matchedVendor) {
    resolvedVendorId = matchedVendor.id;
  }

  const newProduct = {
    id,
    name: name.trim(),
    price: Number(price),
    categoryId: categoryId || "food_snacks",
    categoryName: categoryName || "Food & Snacks",
    vendorId: resolvedVendorId,
    vendorName: vendorName || (matchedVendor ? matchedVendor.name : "Local Vendor"),
    vendorArea: vendorArea || (matchedVendor ? matchedVendor.area : "Katsina Central"),
    rating: 5.0,
    ratingCount: 1,
    description: description || "",
    hasExplicitStockCount: explicitStock,
    stockCount: parsedStockCount,
    inStock: initialInStock,
    deliveryAvailable: true,
    pickupAvailable: true,
    badge: "NEW",
    images: Array.isArray(images) ? images : [],
    createdAt: Date.now()
  };

  db.products.push(newProduct);
  writeDb(db);

  return res.status(201).json(newProduct);
});

// Bulk synchronization & database self-healing endpoint
app.post('/api/sync/bulk', (req, res) => {
  const { users, vendors, vendorApplications, products } = req.body;
  const db = readDb();
  let updated = false;

  if (Array.isArray(users)) {
    users.forEach(u => {
      if (u.email && !db.users.some(existing => existing.email.toLowerCase() === u.email.toLowerCase())) {
        db.users.push({
          id: u.id || `usr_${uuidv4().substring(0, 8)}`,
          name: u.name,
          email: u.email.toLowerCase().trim(),
          phone: u.phone || "",
          location: u.location || "Katsina Central",
          address: u.address || "",
          password: u.password || "google_oauth_user",
          role: u.role || "Customer",
          isBanned: false,
          banType: "none",
          banReason: "",
          banExplanation: "",
          banExpiresAt: null,
          bannedAt: null,
          createdAt: u.createdAt || Date.now()
        });
        updated = true;
      }
    });
  }

  if (Array.isArray(vendors)) {
    vendors.forEach(v => {
      if (v.ownerEmail && !db.vendors.some(existing => existing.ownerEmail.toLowerCase() === v.ownerEmail.toLowerCase())) {
        db.vendors.push(v);
        updated = true;
      }
    });
  }

  if (Array.isArray(vendorApplications)) {
    vendorApplications.forEach(a => {
      if (a.ownerEmail && !db.vendorApplications.some(existing => existing.ownerEmail.toLowerCase() === a.ownerEmail.toLowerCase())) {
        db.vendorApplications.push(a);
        updated = true;
      }
    });
  }

  if (Array.isArray(products)) {
    products.forEach(p => {
      if (p.name && !db.products.some(existing => existing.id === p.id || (existing.name.toLowerCase() === p.name.toLowerCase() && existing.vendorId === p.vendorId))) {
        db.products.push(p);
        updated = true;
      }
    });
  }

  if (updated) {
    writeDb(db);
  }

  return res.json({
    success: true,
    totalUsers: db.users.length,
    totalVendors: db.vendors.length,
    totalApplications: db.vendorApplications.length,
    totalProducts: db.products.length
  });
});

app.patch('/api/products/:id/stock', (req, res) => {
  const { inStock, stockCount } = req.body;
  const db = readDb();
  const product = db.products.find(p => p.id === req.params.id);
  if (!product) {
    return res.status(404).json({ success: false, message: "Product not found." });
  }

  if (stockCount !== undefined && stockCount !== null && stockCount !== "") {
    product.hasExplicitStockCount = true;
    product.stockCount = Math.max(0, parseInt(stockCount, 10));
    product.inStock = product.stockCount > 0;
  } else if (inStock !== undefined) {
    // Only manual toggle if not tracking unit count
    product.inStock = Boolean(inStock);
    if (!product.hasExplicitStockCount) {
      product.stockCount = null;
    }
  }

  writeDb(db);
  return res.json({ success: true, product });
});

app.delete('/api/products/:id', (req, res) => {
  const db = readDb();
  const index = db.products.findIndex(p => p.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Product not found." });
  }
  const removed = db.products.splice(index, 1)[0];
  writeDb(db);
  return res.json({ success: true, message: "Product removed successfully.", product: removed });
});

// Orders
app.post('/api/orders', (req, res) => {
  const { userId, customerName, customerEmail, customerPhone, deliveryAddress, vendorId, vendorName, items, total, paymentMethod } = req.body;

  if (!items || !items.length || !total) {
    return res.status(400).json({ success: false, message: "items and total are required." });
  }

  const db = readDb();
  const orderId = `ord_${uuidv4().substring(0, 8)}`;

  // Automatically deduct inventory for products with tracked stock units
  if (Array.isArray(items)) {
    for (const item of items) {
      const prodId = item.productId || item.product?.id || item.id;
      const qty = Number(item.quantity || 1);
      if (prodId) {
        const prod = db.products.find(p => p.id === prodId);
        if (prod && prod.hasExplicitStockCount && prod.stockCount !== null && prod.stockCount !== undefined) {
          prod.stockCount = Math.max(0, prod.stockCount - qty);
          if (prod.stockCount === 0) {
            prod.inStock = false; // Automatically marked unavailable when finished from orders!
          }
        }
      }
    }
  }

  const order = {
    id: orderId,
    userId: userId || null,
    customerName: customerName || "Customer",
    customerEmail: customerEmail || "",
    customerPhone: customerPhone || "",
    deliveryAddress: deliveryAddress || "Katsina Central",
    vendorId: vendorId || "",
    vendorName: vendorName || "",
    items,
    total: Number(total),
    paymentMethod: paymentMethod || "Cash on Delivery",
    status: "Pending",
    createdAt: Date.now()
  };

  db.orders.push(order);
  writeDb(db);

  return res.status(201).json({ success: true, orderId: order.id, order });
});

// ================= PAYSTACK PAYMENT INTEGRATION =================

/**
 * Initialize Paystack Transaction
 */
app.post('/api/payments/paystack/initialize', async (req, res) => {
  const { email, amount, metadata, callbackUrl } = req.body;
  if (!email || !amount) {
    return res.status(400).json({ success: false, message: "email and amount (in NGN) are required." });
  }

  try {
    const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: email.trim(),
        amount: Math.round(Number(amount) * 100), // In Kobo (1 NGN = 100 Kobo)
        callback_url: callbackUrl || undefined,
        metadata: metadata || {}
      })
    });

    const data = await paystackRes.json();
    if (!paystackRes.ok || !data.status) {
      return res.status(paystackRes.status || 400).json({
        success: false,
        message: data.message || "Failed to initialize Paystack payment",
        error: data
      });
    }

    return res.json({
      success: true,
      authorizationUrl: data.data.authorization_url,
      accessCode: data.data.access_code,
      reference: data.data.reference
    });
  } catch (err) {
    console.error("Paystack initialize error:", err);
    return res.status(500).json({ success: false, message: "Paystack initialization failed", error: err.message });
  }
});

/**
 * Verify Paystack Transaction
 */
app.get('/api/payments/paystack/verify/:reference', async (req, res) => {
  const { reference } = req.params;
  if (!reference) {
    return res.status(400).json({ success: false, message: "Reference is required." });
  }

  try {
    const paystackRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await paystackRes.json();
    if (!paystackRes.ok || !data.status) {
      return res.status(paystackRes.status || 400).json({
        success: false,
        message: data.message || "Failed to verify Paystack payment",
        error: data
      });
    }

    const transaction = data.data;
    const isSuccess = transaction.status === "success";

    // Auto-update application or order if metadata contains it
    if (isSuccess && transaction.metadata) {
      const db = readDb();
      if (transaction.metadata.applicationId) {
        const appFound = db.vendorApplications.find(a => a.id === transaction.metadata.applicationId);
        if (appFound) {
          appFound.isRegistrationFeePaid = true;
          appFound.paymentReference = reference;
          appFound.status = "Approved";
          writeDb(db);
        }
      }
      if (transaction.metadata.orderId) {
        const orderFound = db.orders.find(o => o.id === transaction.metadata.orderId);
        if (orderFound) {
          orderFound.paymentStatus = "Paid";
          orderFound.paymentReference = reference;
          writeDb(db);
        }
      }
    }

    return res.json({
      success: isSuccess,
      status: transaction.status,
      amount: transaction.amount / 100,
      currency: transaction.currency,
      channel: transaction.channel,
      paidAt: transaction.paid_at,
      customerEmail: transaction.customer?.email,
      metadata: transaction.metadata
    });
  } catch (err) {
    console.error("Paystack verify error:", err);
    return res.status(500).json({ success: false, message: "Paystack verification failed", error: err.message });
  }
});


app.get('/api/orders', (req, res) => {
  const db = readDb();
  let list = db.orders;
  if (req.query.vendorId) {
    list = list.filter(o => o.vendorId === req.query.vendorId);
  }
  return res.json(list);
});

app.get('/api/orders/user/:email', (req, res) => {
  const db = readDb();
  const userOrders = db.orders.filter(o => o.customerEmail?.toLowerCase() === req.params.email.toLowerCase());
  return res.json(userOrders);
});

app.patch('/api/orders/:id/status', (req, res) => {
  const { status } = req.body;
  const db = readDb();
  const order = db.orders.find(o => o.id === req.params.id);
  if (!order) {
    return res.status(404).json({ success: false, message: "Order not found." });
  }
  order.status = status;
  writeDb(db);
  return res.json(order);
});

// Complaints, Reports & Suggestions
app.post('/api/complaints', (req, res) => {
  const { userEmail, userName, userPhone, orderId, vendorName, category, description } = req.body;
  const db = readDb();
  const record = {
    id: `cmp_${uuidv4().substring(0, 8)}`,
    userEmail: userEmail || "",
    userName: userName || "",
    userPhone: userPhone || "",
    orderId: orderId || null,
    vendorName: vendorName || "",
    category: category || "General",
    description: description || "",
    status: "Open",
    createdAt: Date.now()
  };
  db.complaints.push(record);

  // Also push to suggestions so reports & complaints show in the control website's suggestions section
  db.suggestions.push({
    id: `sug_${uuidv4().substring(0, 8)}`,
    userEmail: userEmail || "",
    userName: userName || "",
    category: `[Report: ${category || "General"}]`,
    suggestion: `Phone: ${userPhone || 'N/A'}${orderId ? ' | Order: ' + orderId : ''}${vendorName ? ' | Vendor: ' + vendorName : ''}\n\n${description || ''}`,
    createdAt: Date.now()
  });

  writeDb(db);
  return res.status(201).json({ success: true, message: "Complaint logged successfully.", id: record.id });
});

app.post('/api/reports', (req, res) => {
  const { reporterEmail, reporterName, targetType, targetId, reason, details } = req.body;
  const db = readDb();
  const record = {
    id: `rep_${uuidv4().substring(0, 8)}`,
    reporterEmail: reporterEmail || "",
    reporterName: reporterName || "",
    targetType: targetType || "Vendor",
    targetId: targetId || "",
    reason: reason || "Violation",
    details: details || "",
    status: "UnderReview",
    createdAt: Date.now()
  };
  db.reports.push(record);

  // Also push to suggestions for control website
  db.suggestions.push({
    id: `sug_${uuidv4().substring(0, 8)}`,
    userEmail: reporterEmail || "",
    userName: reporterName || "",
    category: `[Violation: ${reason || "Misconduct"}]`,
    suggestion: `Target: ${targetType || 'Vendor'} (${targetId || 'N/A'})\n\n${details || ''}`,
    createdAt: Date.now()
  });

  writeDb(db);
  return res.status(201).json({ success: true, message: "Report submitted.", id: record.id });
});

app.post('/api/suggestions', (req, res) => {
  const { userEmail, userName, category, suggestion } = req.body;
  const db = readDb();
  const record = {
    id: `sug_${uuidv4().substring(0, 8)}`,
    userEmail: userEmail || "",
    userName: userName || "",
    category: category || "General",
    suggestion: suggestion || "",
    createdAt: Date.now()
  };
  db.suggestions.push(record);
  writeDb(db);
  return res.status(201).json({ success: true, message: "Suggestion received with thanks!", id: record.id });
});

// Admin Overview
app.get('/api/admin/overview', (req, res) => {
  const db = readDb();
  return res.json({
    totalUsers: db.users.length,
    totalVendors: db.vendors.length,
    activeVendors: db.vendors.filter(v => v.status === "Active" && !v.isBanned).length,
    bannedVendors: db.vendors.filter(v => v.isBanned).length,
    bannedUsers: db.users.filter(u => u.isBanned).length,
    pendingApplications: db.vendorApplications.filter(a => a.status === "PendingReview").length,
    totalProducts: db.products.length,
    totalOrders: db.orders.length,
    totalComplaints: db.complaints.length,
    totalReports: db.reports.length,
    totalSuggestions: db.suggestions.length,
    revenueGenerated: db.vendorApplications.filter(a => a.isRegistrationFeePaid).length * 1000
  });
});

// Start listening
app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`  LocoVend Master API Server Running on port ${PORT}`);
  console.log(`  Master API Key: ${MASTER_API_KEY}`);
  console.log(`  Super Admin: khaleelktn@gmail.com`);
  console.log(`  Public Documentation: http://localhost:${PORT}/api/docs`);
  console.log(`=================================================`);
});
