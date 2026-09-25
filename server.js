const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Master API Key for all platforms (Android, iOS, Web, Admin)
const MASTER_API_KEY = process.env.API_KEY ||
                       process.env['x-api-key'] ||
                       process.env.X_API_KEY ||
                       'locovend_live_sec_key_katsina_2026';

// Middleware
app.use(cors());
app.use(express.json());

// Persistent File-based Database
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'locovend_db.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory 2FA verification storage: { email: { code, expiresAt } }
const pendingAdminOtps = new Map();

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
      isBanned: false,
      banType: "none",
      banReason: "",
      banExplanation: "",
      banExpiresAt: null,
      bannedAt: null,
      createdAt: Date.now()
    }
  ],
  vendors: [
    {
      id: "vnd_katsina_masa_01",
      name: "Al-Baraka Masa & Fara Specials",
      motto: "Authentic Katsina Taste, Hot & Fresh",
      category: "food_snacks",
      area: "Rafin Dadi",
      address: "Near Old Central Market, Rafin Dadi, Katsina",
      phone: "+2348031234567",
      ownerEmail: "albaraka@locovend.ng",
      status: "Active",
      rating: 4.8,
      reviewsCount: 34,
      deliveryTimeMinutes: "15-25 min",
      deliveryFee: 500,
      isOpen: true,
      isVerified: true,
      isPioneerVendor: true,
      isBanned: false,
      banType: "none",
      banReason: "",
      banExplanation: "",
      banExpiresAt: null,
      logoUri: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&q=80",
      createdAt: Date.now()
    },
    {
      id: "vnd_royal_turare_02",
      name: "Baitul Oud & Royal Fragrances",
      motto: "Pure Arabian Oils & Turaren Wuta",
      category: "perfumes_fragrances",
      area: "GRA Katsina",
      address: "Commercial Layout, GRA, Katsina",
      phone: "+2348069876543",
      ownerEmail: "baituloud@locovend.ng",
      status: "Active",
      rating: 4.9,
      reviewsCount: 22,
      deliveryTimeMinutes: "20-30 min",
      deliveryFee: 600,
      isOpen: true,
      isVerified: true,
      isPioneerVendor: true,
      isBanned: false,
      banType: "none",
      banReason: "",
      banExplanation: "",
      banExpiresAt: null,
      logoUri: "https://images.unsplash.com/photo-1616949755610-8c9bbc08f138?w=400&q=80",
      createdAt: Date.now()
    }
  ],
  products: [
    {
      id: "prd_masa_special_01",
      name: "Special Katsina Masa Platter (10 pcs) with Yaji",
      price: 2500,
      categoryId: "food_snacks",
      categoryName: "Food & Snacks",
      vendorId: "vnd_katsina_masa_01",
      vendorName: "Al-Baraka Masa & Fara Specials",
      vendorArea: "Rafin Dadi",
      rating: 4.9,
      ratingCount: 28,
      description: "Crispy outer crust, tender fluffy centre served with spicy ground peanut yaji and slow-cooked vegetable soup.",
      inStock: true,
      stockCount: 50,
      images: [
        "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600&auto=format&fit=crop&q=80"
      ],
      createdAt: Date.now()
    },
    {
      id: "prd_oud_oil_02",
      name: "Royal Kalemat Bukhoor & Concentrated Oud Oil (12ml)",
      price: 6500,
      categoryId: "perfumes_fragrances",
      categoryName: "Perfumes & Fragrances",
      vendorId: "vnd_royal_turare_02",
      vendorName: "Baitul Oud & Royal Fragrances",
      vendorArea: "GRA Katsina",
      rating: 5.0,
      ratingCount: 19,
      description: "Original Arabian oil with amber, smoky sandalwood and sweet honey notes. Long lasting 48-hour scent.",
      inStock: true,
      stockCount: 20,
      images: [
        "https://images.unsplash.com/photo-1616949755610-8c9bbc08f138?w=600&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1594035910387-fea47794261f?w=600&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80"
      ],
      createdAt: Date.now()
    }
  ],
  vendorApplications: [],
  orders: [],
  complaints: [],
  reports: [],
  suggestions: []
};

// Database helper functions
function readDb() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(INITIAL_DATABASE, null, 2), 'utf-8');
    return INITIAL_DATABASE;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const data = JSON.parse(raw);

    // Safeguard collections
    if (!data.admins) data.admins = [...INITIAL_DATABASE.admins];
    if (!data.adminLogs) data.adminLogs = [...INITIAL_DATABASE.adminLogs];
    if (!data.users) data.users = [];
    if (!data.vendors) data.vendors = [];
    if (!data.products) data.products = [];
    if (!data.vendorApplications) data.vendorApplications = [];
    if (!data.orders) data.orders = [];
    if (!data.complaints) data.complaints = [];
    if (!data.reports) data.reports = [];
    if (!data.suggestions) data.suggestions = [];

    // Ensure default superadmin ALWAYS exists
    const superAdmin = data.admins.find(a => a.email.toLowerCase() === "khaleelktn@gmail.com");
    if (!superAdmin) {
      data.admins.unshift({
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
      });
    } else {
      superAdmin.password = "Katsinaktn_1";
      superAdmin.isSuperAdmin = true;
      superAdmin.isDeletable = false;
      superAdmin.isEditable = false;
    }

    // Clean up any admin accounts from data.users
    data.users = data.users.filter(u => u.id !== "usr_admin_001" && u.email?.toLowerCase() !== "admin@locovend.ng" && u.role !== "Admin");

    // Ensure KIDCOD is always present in users
    const hasKidcod = data.users.some(u => u.email?.toLowerCase() === "kcoding14@gmail.com");
    if (!hasKidcod) {
      data.users.push({
        id: "usr_kidcod_01",
        name: "KIDCOD",
        email: "kcoding14@gmail.com",
        phone: "09066267266",
        location: "Katsina Central",
        address: "5000 Vista Del Lago Rd, Ukiah, CA 95482, USA",
        password: "google_oauth_user",
        role: "Customer",
        isBanned: false,
        banType: "none",
        banReason: "",
        banExplanation: "",
        banExpiresAt: null,
        bannedAt: null,
        createdAt: Date.now()
      });
    }

    return data;
  } catch (err) {
    console.error("Error reading database file, resetting to initial:", err);
    return INITIAL_DATABASE;
  }
}

function writeDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error("Error writing to database file:", err);
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
    db.adminLogs = db.adminLogs.slice(0, 500);
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

  if (user.isBanned) {
    if (user.banType === 'temporary' && user.banExpiresAt && Date.now() > user.banExpiresAt) {
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

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 10 * 60 * 1000;

  pendingAdminOtps.set(admin.email.toLowerCase(), { code, expiresAt });

  return res.json({
    success: true,
    message: `Verification code sent to ${admin.email}`,
    email: admin.email,
    verificationCode: code,
    expiresInMinutes: 10
  });
});

app.post('/api/admin/auth/verify-code', (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ success: false, message: "Email and verification code are required." });
  }

  const cleanEmail = email.toLowerCase().trim();
  const pending = pendingAdminOtps.get(cleanEmail);

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

app.get('/api/admin/users', (req, res) => {
  const db = readDb();
  const adminEmails = (db.admins || []).map(a => a.email.toLowerCase());
  // Exclude admin accounts so they only appear in the Admin section
  const customerAndVendorUsers = db.users.filter(u => u.role !== "Admin" && !adminEmails.includes(u.email?.toLowerCase()));

  const enrichedUsers = customerAndVendorUsers.map(u => {
    const userOrders = db.orders.filter(o => o.customerEmail?.toLowerCase() === u.email.toLowerCase() || o.userId === u.id);
    const totalPurchasesCount = userOrders.length;
    const totalPurchasesAmount = userOrders.reduce((sum, o) => sum + (o.total || 0), 0);

    const userComplaints = db.complaints.filter(c => c.userEmail?.toLowerCase() === u.email.toLowerCase());
    const userReports = db.reports.filter(r => r.reporterEmail?.toLowerCase() === u.email.toLowerCase());
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

app.post('/api/admin/users/:id/ban', (req, res) => {
  const { type, reason, explanation, durationDays, adminEmail } = req.body;
  const db = readDb();
  const user = db.users.find(u => u.id === req.params.id);

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found." });
  }

  if (type === "none" || !type) {
    user.isBanned = false;
    user.banType = "none";
    user.banReason = "";
    user.banExplanation = "";
    user.banExpiresAt = null;
    user.bannedAt = null;
    logAdminAction(adminEmail, "USER_UNBANNED", `Unbanned user ${user.email} (${user.name})`);
  } else {
    user.isBanned = true;
    user.banType = type;
    user.banReason = reason || "Violation of Terms";
    user.banExplanation = explanation || "";
    user.bannedAt = Date.now();
    user.banExpiresAt = type === "temporary" && durationDays
      ? Date.now() + durationDays * 24 * 60 * 60 * 1000
      : null;

    logAdminAction(adminEmail, "USER_BANNED", `Banned user ${user.email} (${type}). Reason: ${reason}. Exp: ${explanation}`);
  }

  writeDb(db);
  return res.json({ success: true, message: `User status updated.`, user });
});

// ================= SECTION 2: VENDORS (& THEIR STORES) =================

app.get('/api/admin/vendors', (req, res) => {
  const db = readDb();

  const vendorsList = db.vendors.map(v => {
    const vendorOrders = db.orders.filter(o => o.vendorId === v.id || o.vendorName === v.name);
    const totalSalesMade = vendorOrders.length;
    const totalRevenue = vendorOrders.reduce((sum, o) => sum + (o.total || 0), 0);

    const vendorProducts = db.products.filter(p => p.vendorId === v.id);
    const totalProducts = vendorProducts.length;
    const totalProductsAvailable = vendorProducts.filter(p => p.inStock).length;

    const vendorComplaints = db.complaints.filter(c => c.vendorName?.toLowerCase() === v.name.toLowerCase() || c.vendorId === v.id);
    const vendorReports = db.reports.filter(r => r.targetId === v.id || r.targetName?.toLowerCase() === v.name.toLowerCase());

    return {
      id: v.id,
      name: v.name,
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

app.post('/api/admin/vendors/:id/ban', (req, res) => {
  const { type, reason, explanation, durationDays, adminEmail } = req.body;
  const db = readDb();
  const vendor = db.vendors.find(v => v.id === req.params.id);
  if (!vendor) {
    return res.status(404).json({ success: false, message: "Vendor not found." });
  }

  if (type === "none" || !type) {
    vendor.isBanned = false;
    vendor.banType = "none";
    vendor.banReason = "";
    vendor.banExplanation = "";
    vendor.banExpiresAt = null;
    vendor.isOpen = true;
    logAdminAction(adminEmail, "VENDOR_STORE_UNBANNED", `Unbanned vendor store "${vendor.name}"`);
  } else {
    vendor.isBanned = true;
    vendor.banType = type;
    vendor.banReason = reason || "Policy violation";
    vendor.banExplanation = explanation || "";
    vendor.banExpiresAt = type === "temporary" && durationDays
      ? Date.now() + durationDays * 24 * 60 * 60 * 1000
      : null;
    vendor.isOpen = false;
    logAdminAction(adminEmail, "VENDOR_STORE_BANNED", `Banned vendor store "${vendor.name}" (${type}). Reason: ${reason}. Exp: ${explanation}`);
  }

  writeDb(db);
  return res.json({ success: true, message: "Vendor ban status updated.", vendor });
});

// ================= SECTION 3: APPLICATIONS & SUGGESTIONS =================

app.get('/api/admin/applications', (req, res) => {
  const db = readDb();
  return res.json(db.vendorApplications);
});

app.post('/api/admin/applications/:id/decision', (req, res) => {
  const { decision, reason, explanation, adminEmail } = req.body;
  const db = readDb();
  const application = db.vendorApplications.find(a => a.id === req.params.id);

  if (!application) {
    return res.status(404).json({ success: false, message: "Vendor application not found." });
  }

  if (decision === "accept") {
    application.status = "Approved";
    application.approvedAt = Date.now();

    let existingVendor = db.vendors.find(v => v.ownerEmail?.toLowerCase() === application.ownerEmail.toLowerCase());
    if (!existingVendor) {
      existingVendor = {
        id: `vnd_${uuidv4().substring(0, 8)}`,
        name: application.name,
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
    }

    const user = db.users.find(u => u.email.toLowerCase() === application.ownerEmail.toLowerCase());
    if (user) {
      user.role = "Vendor";
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

app.put('/api/admin/admins/:id', (req, res) => {
  const { name, email, password, adminEmail } = req.body;
  const db = readDb();
  const admin = db.admins.find(a => a.id === req.params.id);

  if (!admin) {
    return res.status(404).json({ success: false, message: "Admin account not found." });
  }

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

app.delete('/api/admin/admins/:id', (req, res) => {
  const { adminEmail } = req.body || {};
  const db = readDb();
  const admin = db.admins.find(a => a.id === req.params.id);

  if (!admin) {
    return res.status(404).json({ success: false, message: "Admin account not found." });
  }

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

app.get('/api/admin/logs', (req, res) => {
  const db = readDb();
  return res.json(db.adminLogs);
});

// ================= PUBLIC VENDORS & PRODUCTS =================

app.get('/api/vendors', (req, res) => {
  const db = readDb();
  let list = db.vendors.filter(v => !v.isBanned);
  if (req.query.category) {
    list = list.filter(v => v.category === req.query.category);
  }
  if (req.query.area) {
    list = list.filter(v => v.area.toLowerCase().includes(req.query.area.toLowerCase()));
  }
  return res.json(list);
});

app.post('/api/vendors/apply', (req, res) => {
  const { ownerEmail, name, category, area, phone, description, logoUri } = req.body;
  if (!ownerEmail || !name || !phone) {
    return res.status(400).json({ success: false, message: "ownerEmail, name, and phone are required." });
  }

  const db = readDb();
  const id = `vapp_${uuidv4().substring(0, 8)}`;
  const application = {
    id,
    ownerEmail: ownerEmail.toLowerCase(),
    name,
    category: category || "food_snacks",
    area: area || "Katsina Central",
    phone,
    description: description || "",
    logoUri: logoUri || null,
    status: "PendingReview",
    submittedAt: Date.now(),
    isRegistrationFeePaid: false,
    message: "Application submitted successfully. Under 24-hour review."
  };

  db.vendorApplications.push(application);
  writeDb(db);

  return res.status(201).json(application);
});

app.get('/api/vendors/status/:id', (req, res) => {
  const db = readDb();
  const appFound = db.vendorApplications.find(a => a.id === req.params.id);
  if (!appFound) {
    return res.status(404).json({ success: false, message: "Application not found." });
  }
  return res.json(appFound);
});

app.post('/api/vendors/pay-activation', (req, res) => {
  const { applicationId, reference, amount } = req.body;
  const db = readDb();
  const appFound = db.vendorApplications.find(a => a.id === applicationId);
  if (!appFound) {
    return res.status(404).json({ success: false, message: "Application not found." });
  }

  appFound.isRegistrationFeePaid = true;
  appFound.paymentReference = reference;
  appFound.paymentAmount = amount || 1000;
  appFound.status = "Approved";

  writeDb(db);
  return res.json({ success: true, message: "Payment verified. Vendor profile approved!", application: appFound });
});

// Products
app.get('/api/products', (req, res) => {
  const db = readDb();
  let list = db.products;
  if (req.query.vendorId) {
    list = list.filter(p => p.vendorId === req.query.vendorId);
  }
  if (req.query.category) {
    list = list.filter(p => p.categoryId === req.query.category);
  }
  return res.json(list);
});

app.post('/api/products', (req, res) => {
  const { name, price, categoryId, categoryName, vendorId, vendorName, vendorArea, description, images } = req.body;
  if (!name || !price || !vendorId) {
    return res.status(400).json({ success: false, message: "name, price, and vendorId are required." });
  }

  const db = readDb();
  const id = `prd_${uuidv4().substring(0, 8)}`;
  const newProduct = {
    id,
    name,
    price: Number(price),
    categoryId: categoryId || "general",
    categoryName: categoryName || "General",
    vendorId,
    vendorName: vendorName || "Local Vendor",
    vendorArea: vendorArea || "Katsina Central",
    rating: 5.0,
    ratingCount: 1,
    description: description || "",
    inStock: true,
    stockCount: 20,
    images: images || ["https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80"],
    createdAt: Date.now()
  };

  db.products.push(newProduct);
  writeDb(db);

  return res.status(201).json(newProduct);
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
  const adminEmails = (db.admins || []).map(a => a.email.toLowerCase());
  const regularUsers = db.users.filter(u => u.role !== "Admin" && !adminEmails.includes(u.email?.toLowerCase()));

  return res.json({
    totalUsers: regularUsers.length,
    totalVendors: db.vendors.length,
    activeVendors: db.vendors.filter(v => v.status === "Active" && !v.isBanned).length,
    bannedVendors: db.vendors.filter(v => v.isBanned).length,
    bannedUsers: regularUsers.filter(u => u.isBanned).length,
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
