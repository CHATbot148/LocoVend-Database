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

app.use(cors());
app.use(express.json());

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'locovend_db.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const INITIAL_DATABASE = {
  users: [
    {
      id: "usr_admin_001",
      name: "LocoVend Administrator",
      email: "admin@locovend.ng",
      phone: "+2348000000000",
      location: "Katsina Central",
      address: "Nagogo Road, Katsina",
      password: "admin_secure_password_2026",
      role: "Admin",
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
      isPioneerVendor: true,
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
      isPioneerVendor: true,
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
      description: "Crispy outer crust, tender fluffy centre served with spicy peanut yaji and slow-cooked vegetable soup.",
      inStock: true,
      stockCount: 50,
      images: [
        "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&auto=format&fit=crop&q=80"
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
      description: "Original Arabian oil with amber, smoky sandalwood and sweet honey notes.",
      inStock: true,
      stockCount: 20,
      images: [
        "https://images.unsplash.com/photo-1616949755610-8c9bbc08f138?w=600&auto=format&fit=crop&q=80"
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

function readDb() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(INITIAL_DATABASE, null, 2), 'utf-8');
    return INITIAL_DATABASE;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return INITIAL_DATABASE;
  }
}

function writeDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {}
}

function requireApiKey(req, res, next) {
  const providedKey = req.headers['x-api-key'] ||
                      req.query.api_key ||
                      (req.headers.authorization && req.headers.authorization.replace('Bearer ', ''));

  if (!providedKey || providedKey !== MASTER_API_KEY) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized",
      message: "Invalid or missing API key."
    });
  }
  next();
}

app.get('/', (req, res) => {
  res.json({
    status: "online",
    service: "LocoVend Hyperlocal API Server",
    version: "1.0.0",
    docs: "/api/docs"
  });
});

app.get('/health', (req, res) => {
  res.json({ status: "healthy", timestamp: Date.now() });
});

app.use('/api', requireApiKey);

app.post('/api/auth/register', (req, res) => {
  const { name, email, phone, location, address, password } = req.body;
  if (!email || !name || !password) {
    return res.status(400).json({ success: false, message: "Name, email, and password are required." });
  }

  const db = readDb();
  const existing = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    return res.status(409).json({ success: false, message: "User already exists." });
  }

  const newUser = {
    id: `usr_${uuidv4().substring(0, 8)}`,
    name,
    email: email.toLowerCase(),
    phone: phone || "",
    location: location || "Katsina Central",
    address: address || "",
    password,
    role: "Customer",
    createdAt: Date.now()
  };

  db.users.push(newUser);
  writeDb(db);

  return res.status(201).json(newUser);
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const db = readDb();
  const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());

  if (!user || user.password !== password) {
    return res.status(401).json({ success: false, message: "Invalid email or password." });
  }

  return res.json({ token: `token_${uuidv4()}`, ...user });
});

app.get('/api/vendors', (req, res) => {
  const db = readDb();
  return res.json(db.vendors);
});

app.post('/api/vendors/apply', (req, res) => {
  const db = readDb();
  const application = {
    id: `vapp_${uuidv4().substring(0, 8)}`,
    ...req.body,
    status: "PendingReview",
    submittedAt: Date.now()
  };
  db.vendorApplications.push(application);
  writeDb(db);
  return res.status(201).json(application);
});

app.get('/api/products', (req, res) => {
  const db = readDb();
  return res.json(db.products);
});

app.post('/api/products', (req, res) => {
  const db = readDb();
  const newProduct = {
    id: `prd_${uuidv4().substring(0, 8)}`,
    ...req.body,
    createdAt: Date.now()
  };
  db.products.push(newProduct);
  writeDb(db);
  return res.status(201).json(newProduct);
});

app.post('/api/orders', (req, res) => {
  const db = readDb();
  const newOrder = {
    id: `ord_${uuidv4().substring(0, 8).toUpperCase()}`,
    ...req.body,
    status: "PLACED",
    createdAt: Date.now()
  };
  db.orders.push(newOrder);
  writeDb(db);
  return res.status(201).json(newOrder);
});

app.get('/api/orders', (req, res) => {
  const db = readDb();
  return res.json(db.orders);
});

app.get('/api/admin/overview', (req, res) => {
  const db = readDb();
  return res.json({
    totalUsers: db.users.length,
    totalVendors: db.vendors.length,
    activeVendors: db.vendors.filter(v => v.status === "Active").length,
    pendingApplications: db.vendorApplications.filter(a => a.status === "PendingReview").length,
    totalProducts: db.products.length,
    totalOrders: db.orders.length
  });
});

app.listen(PORT, () => {
  console.log(`LocoVend Master API running on port ${PORT}`);
});
