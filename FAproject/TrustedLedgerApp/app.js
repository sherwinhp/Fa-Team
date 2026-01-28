require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const {Web3} = require('web3');
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");

//Set up view engine from ejs library
const app = express();
//Set up view engine
app.set('view engine', 'ejs');
//This line of code tells Express to serve static files (such as images, CSS, JavaScript files, or PDFs)
//from the public directory
app.use(express.static('public'))
//enable form processing
app.use(express.urlencoded({
    extended: false
}));
app.use(session({
  secret: "blockchain-track-session",
  resave: false,
  saveUninitialized: false
}));

const WEB3_PROVIDER_URL = process.env.WEB3_PROVIDER_URL
  || process.env.GANACHE_PROVIDER_URL
  || 'http://127.0.0.1:7545';
const ETH_USD_RATE = Number(process.env.ETH_USD_RATE) || 1850;
const WALLET_TOKEN_SYMBOL = process.env.WALLET_TOKEN_SYMBOL || 'ETHR';
const WALLET_TOKEN_NAME = process.env.WALLET_TOKEN_NAME || 'Ethereum';
const WALLET_TOKEN_STANDARD = process.env.WALLET_TOKEN_STANDARD || 'ERC-20 Standard Token';
const WALLET_CONTRACT_ADDRESS = process.env.WALLET_CONTRACT_ADDRESS || '';
const WALLET_TOTAL_SUPPLY = process.env.WALLET_TOTAL_SUPPLY || '1,000,000 ETHR';
const sellerAddress = "0x46EB73Cb66991C07622b3aB77a6E9A93139EE661";
const ganacheAccounts = (process.env.GANACHE_ACCOUNTS || process.env.GANACHE_ACCOUNT || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const ganacheChainIds = (process.env.GANACHE_CHAIN_IDS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const ganacheProviderUrl = process.env.GANACHE_PROVIDER_URL || "http://127.0.0.1:7545";

app.use((req, res, next) => {
  res.locals.isLoggedIn = Boolean(req.session && req.session.user);
  res.locals.userRole = req.session && req.session.user ? req.session.user.role : null;
  res.locals.userEmail = req.session && req.session.user ? req.session.user.email : null;
  res.locals.ganacheAccounts = ganacheAccounts;
  res.locals.ganacheChainIds = ganacheChainIds;
  res.locals.ganacheProviderUrl = ganacheProviderUrl;
  res.locals.sellerAddress = sellerAddress;
  next();
});

//start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
// declare the global variables
let account = '';
let shipmentCount = 0;
let loading = true;
let web3Instance = new Web3(WEB3_PROVIDER_URL);
let contractInstance = null;
let walletContractInstance = null;
const upload = multer({ storage: multer.memoryStorage() });

const CARTS_PATH = path.join(__dirname, "data", "carts.json");
let persistedCarts = {};

const loadPersistedCarts = () => {
  try {
    if (fs.existsSync(CARTS_PATH)) {
      const raw = fs.readFileSync(CARTS_PATH, "utf8");
      persistedCarts = raw ? JSON.parse(raw) : {};
    }
  } catch (error) {
    persistedCarts = {};
  }
};

const savePersistedCarts = () => {
  try {
    fs.mkdirSync(path.dirname(CARTS_PATH), { recursive: true });
    fs.writeFileSync(CARTS_PATH, JSON.stringify(persistedCarts, null, 2));
  } catch (error) {
    // ignore persistence errors
  }
};

const getUserCartKey = (req) => {
  const email = req.session && req.session.user ? req.session.user.email : "";
  return email ? email.toLowerCase() : "";
};

const syncCartToStore = (req) => {
  const key = getUserCartKey(req);
  if (!key) {
    return;
  }
  persistedCarts[key] = req.session && req.session.cart ? req.session.cart : { items: {} };
  savePersistedCarts();
};

const loadCartFromStore = (req) => {
  const key = getUserCartKey(req);
  if (!key) {
    return;
  }
  if (persistedCarts[key]) {
    req.session.cart = persistedCarts[key];
  }
};

loadPersistedCarts();

const walletArtifactPath = path.join(__dirname, 'public', 'build', 'WalletContract.json');
let walletContractAbi = null;
try {
  walletContractAbi = JSON.parse(fs.readFileSync(walletArtifactPath, 'utf8')).abi;
} catch (error) {
  console.warn("Wallet contract ABI not available:", error.message || error);
}

const reviewArtifactPath = path.join(__dirname, 'public', 'build', 'ReviewContract.json');
let reviewContractAbi = null;
let reviewContractJson = null;
try {
  reviewContractJson = JSON.parse(fs.readFileSync(reviewArtifactPath, 'utf8'));
  reviewContractAbi = reviewContractJson.abi;
} catch (error) {
  console.warn("Review contract ABI not available:", error.message || error);
}

const reputationArtifactPath = path.join(__dirname, 'public', 'build', 'ReputationContract.json');
let reputationContractAbi = null;
let reputationContractJson = null;
try {
  reputationContractJson = JSON.parse(fs.readFileSync(reputationArtifactPath, 'utf8'));
  reputationContractAbi = reputationContractJson.abi;
} catch (error) {
  console.warn("Reputation contract ABI not available:", error.message || error);
}

const notaryArtifactPath = path.join(__dirname, 'public', 'build', 'DocumentNotaryContract.json');
let notaryContractAbi = null;
let notaryContractJson = null;
try {
  notaryContractJson = JSON.parse(fs.readFileSync(notaryArtifactPath, 'utf8'));
  notaryContractAbi = notaryContractJson.abi;
} catch (error) {
  console.warn("Document notary ABI not available:", error.message || error);
}

const productArtifactPath = path.join(__dirname, 'public', 'build', 'ProductCatalog.json');
let productContractAbi = null;
let productContractJson = null;
try {
  productContractJson = JSON.parse(fs.readFileSync(productArtifactPath, 'utf8'));
  productContractAbi = productContractJson.abi;
} catch (error) {
  console.warn("Product catalog ABI not available:", error.message || error);
}

const mockProducts = [
  {
    id: "1",
    productInfo: {
      name: "Premium Wireless Headphones",
      description: "Flagship wireless headphones with ANC and premium build.",
      price: "299.99",
      category: "Audio"
    },
    seller: {
      name: "TechHub Singapore",
      rating: 98.5,
      sales: 1247,
      verified: true
    },
    stock: 45,
    status: "In Stock",
    fullDescription:
      "Experience superior sound quality with our flagship wireless headphones. Featuring active noise cancellation, 30-hour battery life, and premium build quality. These headphones deliver an immersive audio experience whether you're traveling, working, or relaxing.",
    features: [
      "Active Noise Cancellation (ANC) - Block out ambient noise",
      "30-hour battery life on a single charge",
      "Premium build quality with aluminum frame",
      "Bluetooth 5.0 for stable, long-range connectivity",
      "Comfortable memory foam ear cushions",
      "Foldable design with premium carrying case",
      "Multi-device pairing support",
      "Touch controls for easy operation"
    ],
    images: [
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e",
      "https://images.unsplash.com/photo-1484704849700-f032a568e944",
      "https://images.unsplash.com/photo-1546435770-a3e426bf472b",
      "https://images.unsplash.com/photo-1487215078519-e21cc028cb29"
    ],
    specifications: [
      { label: "Brand", value: "AudioTech Pro" },
      { label: "Model Number", value: "AT-PRO-3000" },
      { label: "Color", value: "Midnight Black" },
      { label: "Connectivity", value: "Bluetooth 5.0, 3.5mm jack" },
      { label: "Battery Life", value: "30 hours (ANC on), 40 hours (ANC off)" },
      { label: "Charging", value: "USB-C, Fast Charge (10min = 5hrs)" },
      { label: "Weight", value: "250g" },
      { label: "Warranty", value: "2 Years International Warranty" },
      { label: "Driver Size", value: "40mm dynamic drivers" },
      { label: "Frequency Response", value: "20Hz - 20kHz" },
      { label: "Impedance", value: "32 Ohm" },
      { label: "Noise Cancellation", value: "Hybrid ANC up to 30dB" }
    ],
    blockchain: {
      smartContractId: "0x7a9f0b8c2d1a4e3f5b6c7d8e9f0a1b2c3d4e5f6a",
      lastVerified: "Dec 1, 2025 08:30 AM"
    },
    rating: 4.8,
    reviewCount: 2547
  },
  {
    id: "2",
    productInfo: {
      name: "AirPods Pro Gen 2",
      description: "Noise-canceling earbuds with spatial audio and long battery life.",
      price: "0.18",
      category: "Audio"
    },
    seller: {
      name: "TrustedLedger Store",
      rating: 96.4,
      sales: 834,
      verified: true
    },
    stock: 32,
    status: "In Stock",
    fullDescription:
      "Compact premium earbuds with adaptive noise control, clear voice calls, and all-day comfort for travel or work.",
    features: [
      "Adaptive noise control",
      "Spatial audio with head tracking",
      "MagSafe charging case",
      "Sweat and water resistant"
    ],
    images: ["/images/airpods.jpg"],
    specifications: [
      { label: "Battery", value: "Up to 6 hours (earbuds)" },
      { label: "Case", value: "USB-C + wireless charging" },
      { label: "Connectivity", value: "Bluetooth 5.x" },
      { label: "Color", value: "White" }
    ],
    blockchain: {
      smartContractId: "0x2f1d9a5d4b8e6c7a9012f3b4c5d6e7f8a9b0c1d2",
      lastVerified: "Jan 21, 2026 11:05 AM"
    },
    rating: 4.7,
    reviewCount: 1180
  },
  {
    id: "3",
    productInfo: {
      name: "iPhone 15 Pro",
      description: "Flagship smartphone with titanium frame and pro-grade camera.",
      price: "0.92",
      category: "Mobile"
    },
    seller: {
      name: "TrustedLedger Store",
      rating: 97.1,
      sales: 642,
      verified: true
    },
    stock: 18,
    status: "In Stock",
    fullDescription:
      "A premium smartphone with a bright display, fast performance, and advanced camera system for creators.",
    features: [
      "A17 Pro performance",
      "Pro camera system",
      "Titanium design",
      "All-day battery life"
    ],
    images: ["/images/iphone.jpg"],
    specifications: [
      { label: "Display", value: "6.1-inch OLED" },
      { label: "Storage", value: "256GB" },
      { label: "Camera", value: "48MP main" },
      { label: "Color", value: "Natural Titanium" }
    ],
    blockchain: {
      smartContractId: "0x9a8b7c6d5e4f3210a1b2c3d4e5f67890abcdef12",
      lastVerified: "Jan 20, 2026 04:45 PM"
    },
    rating: 4.9,
    reviewCount: 2096
  },
  {
    id: "4",
    productInfo: {
      name: "Power Bank 20000mAh",
      description: "High-capacity portable charger with fast USB-C output.",
      price: "0.06",
      category: "Accessories"
    },
    seller: {
      name: "TrustedLedger Store",
      rating: 95.2,
      sales: 1543,
      verified: true
    },
    stock: 60,
    status: "In Stock",
    fullDescription:
      "Reliable travel power with dual outputs, fast charging, and LED battery indicators.",
    features: [
      "20000mAh capacity",
      "USB-C PD fast charge",
      "Dual output ports",
      "LED battery display"
    ],
    images: ["/images/powerbank.jpg"],
    specifications: [
      { label: "Capacity", value: "20000mAh" },
      { label: "Output", value: "USB-C PD + USB-A" },
      { label: "Charging", value: "Fast charge support" },
      { label: "Color", value: "Midnight Blue" }
    ],
    blockchain: {
      smartContractId: "0x3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f",
      lastVerified: "Jan 19, 2026 09:20 AM"
    },
    rating: 4.6,
    reviewCount: 742
  },
  {
    id: "5",
    productInfo: {
      name: "Supreme Water Blaster",
      description: "Limited-run collector water blaster with Supreme branding.",
      price: "0.12",
      category: "Collectibles"
    },
    seller: {
      name: "TrustedLedger Store",
      rating: 94.8,
      sales: 312,
      verified: true
    },
    stock: 14,
    status: "Limited Stock",
    fullDescription:
      "Streetwear-inspired collector item with premium packaging and verified authenticity.",
    features: [
      "Limited edition release",
      "Authenticity verified",
      "Premium packaging",
      "Display-ready finish"
    ],
    images: ["/images/supreme.jpg"],
    specifications: [
      { label: "Edition", value: "Limited Run" },
      { label: "Material", value: "ABS plastic" },
      { label: "Color", value: "Red" },
      { label: "Includes", value: "Display stand" }
    ],
    blockchain: {
      smartContractId: "0x4a5b6c7d8e9f0123456789abcdefabcdefabcd",
      lastVerified: "Jan 18, 2026 02:10 PM"
    },
    rating: 4.5,
    reviewCount: 188
  }
];

const mockReviews = [
  {
    id: "r1",
    reviewerName: "Alicia T.",
    rating: 5,
    date: "2025-11-21",
    title: "Best audio I have owned",
    comment:
      "Comfortable fit, deep bass, and crystal clear highs. The ANC is excellent for commuting.",
    verifiedPurchase: true,
    helpfulVotes: 24,
    blockchainTxHash: "0x2f1b1b2a7c15a9c8b61a6cdd0d0be031f4ed5c0f2c2fa9e9c7a5c9c1a2b4f8e1"
  },
  {
    id: "r2",
    reviewerName: "Mika S.",
    rating: 4,
    date: "2025-11-10",
    title: "Great sound, battery lasts",
    comment:
      "Battery easily lasts all week. Wish the carry case was a bit smaller.",
    verifiedPurchase: true,
    helpfulVotes: 12,
    blockchainTxHash: "0x8a4c2f6c9d5e1f7a3b0e6c1d2a7f5c9b3e1a4c5f6b7d8e9f0a1b2c3d4e5f6a7"
  },
  {
    id: "r3",
    reviewerName: "Jordan K.",
    rating: 5,
    date: "2025-10-02",
    title: "Premium feel and fast pairing",
    comment:
      "Connected instantly and the build quality feels top notch. Highly recommended.",
    verifiedPurchase: false,
    helpfulVotes: 5,
    blockchainTxHash: "0x6b2f3a1c9d8e7f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1"
  }
];

let products = [];

async function getProductContract() {
  if (!productContractAbi || !productContractJson || !web3Instance) {
    return null;
  }

  const networkId = await web3Instance.eth.net.getId();
  const networkData = productContractJson.networks
    ? productContractJson.networks[networkId]
    : null;

  if (!networkData || !networkData.address) {
    return null;
  }

  return new web3Instance.eth.Contract(productContractAbi, networkData.address);
}

async function getReviewContract() {
  if (!reviewContractAbi || !reviewContractJson || !web3Instance) {
    return null;
  }

  const networkId = await web3Instance.eth.net.getId();
  const networkData = reviewContractJson.networks
    ? reviewContractJson.networks[networkId]
    : null;

  if (!networkData || !networkData.address) {
    return null;
  }

  return new web3Instance.eth.Contract(reviewContractAbi, networkData.address);
}

async function getReputationContract() {
  if (!reputationContractAbi || !reputationContractJson || !web3Instance) {
    return null;
  }

  const networkId = await web3Instance.eth.net.getId();
  const networkData = reputationContractJson.networks
    ? reputationContractJson.networks[networkId]
    : null;

  if (!networkData || !networkData.address) {
    return null;
  }

  return new web3Instance.eth.Contract(reputationContractAbi, networkData.address);
}

async function getNotaryContract() {
  if (!notaryContractAbi || !notaryContractJson || !web3Instance) {
    return null;
  }

  const networkId = await web3Instance.eth.net.getId();
  const networkData = notaryContractJson.networks
    ? notaryContractJson.networks[networkId]
    : null;

  if (!networkData || !networkData.address) {
    return null;
  }

  return new web3Instance.eth.Contract(notaryContractAbi, networkData.address);
}

const buildProductDefaults = (overrides = {}) => {
  const now = new Date();
  return {
    seller: {
      name: "TrustedLedger Store",
      rating: 96.1,
      sales: 0,
      verified: true
    },
    stock: 20,
    status: "In Stock",
    fullDescription:
      overrides.productInfo?.description ||
      "Verified marketplace listing anchored on-chain for authenticity and tracking.",
    features: [
      "Blockchain verified authenticity",
      "Secure escrow-ready checkout",
      "TrustedLedger seller assurance"
    ],
    images: overrides.images && overrides.images.length
      ? overrides.images
      : ["/images/default-product.jpeg"],
    specifications: [
      { label: "Condition", value: "New" },
      { label: "Warranty", value: "1 Year" }
    ],
    blockchain: {
      smartContractId: overrides.contractAddress || "Pending deployment",
      lastVerified: now.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })
    },
    rating: 4.6,
    reviewCount: 0
  };
};

async function loadProductsFromChain() {
  try {
    const contract = await getProductContract();
    if (!contract || !web3Instance) {
      return [];
    }

    const ids = await contract.methods.getProductIds().call();
    if (!ids || !ids.length) {
      return [];
    }

    const items = await Promise.all(
      ids.map(async (id) => {
        const data = await contract.methods.getProduct(id).call();
        const priceEth = web3Instance.utils.fromWei(data.priceWei || "0", "ether");
        const base = {
          id: id,
          productInfo: {
            name: data.name,
            description: data.description,
            price: priceEth,
            category: data.category
          },
          images: data.imageUrl ? [data.imageUrl] : ["/images/default-product.jpeg"]
        };
        return {
          ...buildProductDefaults({
            productInfo: base.productInfo,
            images: base.images,
            contractAddress: contract.options.address
          }),
          ...base
        };
      })
    );

    return items;
  } catch (error) {
    console.warn("Unable to load on-chain products:", error.message || error);
    return [];
  }
}

async function getProductsForView() {
  const chainProducts = await loadProductsFromChain();
  products = chainProducts;
  return products;
}

async function buildCartSummary(req) {
  const liveProducts = await getProductsForView();
  const cart = getCart(req);
  const cartItems = Object.keys(cart.items)
    .map((id) => {
      const product = liveProducts.find((item) => item.id === id);
      if (!product) {
        return null;
      }
      return {
        product,
        quantity: cart.items[id]
      };
    })
    .filter(Boolean);

  const total = cartItems.reduce((sum, item) => {
    const price = Number(item.product.productInfo.price || 0);
    if (!Number.isFinite(price)) {
      return sum;
    }
    return sum + price * item.quantity;
  }, 0);

  return {
    cartItems,
    totalEth: total.toFixed(4)
  };
}

function parseList(input) {
  if (!input) return [];
  return input
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSpecs(input) {
  if (!input) return [];
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, ...rest] = line.split(":");
      const value = rest.join(":").trim();
      return {
        label: label.trim(),
        value: value || "N/A"
      };
    })
    .filter((spec) => spec.label);
}

async function componentWillMount() {
  try {
    await loadWeb3();
    await loadBlockchainData();
  } catch (error) {
    console.error('Error in componentWillMount:', error);
  }
}

async function loadWeb3() {
  if (!web3Instance) {
    web3Instance = new Web3(ganacheProviderUrl);
  }
}

async function loadBlockchainData() {
  try {
    loading = true;
    await loadWeb3();
    const web3 = web3Instance;

    const contractJSON = JSON.parse(
      fs.readFileSync('public/build/ShippingTrackerContract.json', 'utf8')
    );
    const networkId = await web3.eth.net.getId();
    const networkData = contractJSON.networks ? contractJSON.networks[networkId] : null;

    if (!networkData || !networkData.address) {
      throw new Error('ShippingTrackerContract not deployed to detected network');
    }

    contractInstance = new web3.eth.Contract(contractJSON.abi, networkData.address);
    const count = await contractInstance.methods.getShipmentCount().call();
    shipmentCount = parseInt(count);
    return {
      contractInstance,
      shipmentCount
    };
  } catch (error) {
    console.error('Error loading blockchain data:', error);
    throw error;
  } finally {
    loading = false;
  }
}

function requireLogin(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }

  const nextUrl = encodeURIComponent(req.originalUrl || "/");
  return res.redirect(`/login?next=${nextUrl}`);
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === "admin") {
    return next();
  }

  return res.redirect("/admin-login");
}

function buildProductFromForm(body) {
  const now = new Date();
  const images = parseList(body.imageUrls);
  const features = parseList(body.features);
  const specifications = parseSpecs(body.specifications);
  const priceValue = Number(body.price);
  const stockValue = Number(body.stock);

  return {
    id: String(Date.now()),
    productInfo: {
      name: body.name.trim(),
      description: body.description.trim(),
      price: Number.isFinite(priceValue) ? priceValue.toFixed(2) : "0.00",
      category: body.category ? body.category.trim() : "Verified"
    },
    seller: {
      name: body.sellerName ? body.sellerName.trim() : "Marketplace Seller",
      rating: 0,
      sales: 0,
      verified: false
    },
    stock: Number.isFinite(stockValue) ? stockValue : 0,
    status: Number.isFinite(stockValue) && stockValue > 0 ? "In Stock" : "Out of Stock",
    fullDescription: body.fullDescription ? body.fullDescription.trim() : body.description.trim(),
    features: features.length ? features : ["Blockchain verified authenticity", "Secure marketplace escrow"],
    images: images.length ? images : ["/images/default-product.jpeg"],
    specifications: specifications.length
      ? specifications
      : [
          { label: "Category", value: body.category || "Verified" },
          { label: "Stock", value: String(stockValue || 0) }
        ],
    blockchain: {
      smartContractId: "0x" + Math.random().toString(16).slice(2, 42).padEnd(40, "0"),
      lastVerified: now.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })
    },
    rating: 0,
    reviewCount: 0
  };
}

function resolveWalletContract() {
  if (!walletContractAbi || !WALLET_CONTRACT_ADDRESS || !web3Instance) {
    return null;
  }

  walletContractInstance = new web3Instance.eth.Contract(walletContractAbi, WALLET_CONTRACT_ADDRESS);
  return walletContractInstance;
}

function formatUsd(value) {
  const amount = typeof value === "number" ? value : Number(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number.isFinite(amount) ? amount : 0);
}

const toHexQuantity = (value) => {
  if (value === null || value === undefined) {
    return value;
  }
  try {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        return value;
      }
      if (trimmed.startsWith("0x")) {
        return trimmed;
      }
      if (!/^\d+$/.test(trimmed)) {
        return value;
      }
      return `0x${BigInt(trimmed).toString(16)}`;
    }
    if (typeof value === "bigint") {
      return `0x${value.toString(16)}`;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return `0x${BigInt(Math.trunc(value)).toString(16)}`;
    }
    return value;
  } catch (err) {
    return value;
  }
};

const isZeroQuantity = (value) => {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === "number") {
    return value === 0;
  }
  if (typeof value === "bigint") {
    return value === 0n;
  }
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    return trimmed === "0" || trimmed === "0x0";
  }
  return false;
};

const MAX_PRODUCT_PRICE_ETH = 15;

async function getPreferredGasPrice() {
  if (!web3Instance) {
    return null;
  }
  try {
    const chainIdValue = await web3Instance.eth.getChainId();
    const chainId = Number(chainIdValue);
    if (chainId === 5777 || chainId === 1337) {
      return "0";
    }
  } catch (error) {
    // fall through to default gas price
  }
  try {
    return await web3Instance.eth.getGasPrice();
  } catch (error) {
    return null;
  }
}

function buildEmptyWalletSnapshot() {
  return {
    totalBalance: "0.0000",
    symbol: WALLET_TOKEN_SYMBOL,
    ethBalance: "0.0000",
    ethUsd: formatUsd(0),
    tokenBalance: "0.0000",
    tokenUsd: formatUsd(0),
    address: "Not connected",
    token: {
      name: WALLET_TOKEN_NAME,
      symbol: WALLET_TOKEN_SYMBOL,
      contractAddress: WALLET_CONTRACT_ADDRESS || "Not configured",
      totalSupply: WALLET_TOTAL_SUPPLY,
      standard: WALLET_TOKEN_STANDARD
    },
    transactions: []
  };
}

const WALLET_TX_TYPE_LABELS = {
  0: "Top Up",
  1: "Transfer",
  2: "Escrow Created",
  3: "Escrow Released",
  4: "Escrow Refunded"
};

const normalizeAddress = (value) => String(value || "").toLowerCase();

const formatWalletAmount = (amountWei, outgoing) => {
  if (!web3Instance) {
    return outgoing ? "-0.0000" : "+0.0000";
  }
  const ethAmount = Number.parseFloat(web3Instance.utils.fromWei(amountWei || "0", "ether"));
  const display = Number.isFinite(ethAmount) ? ethAmount.toFixed(4) : "0.0000";
  return outgoing ? `-${display}` : `+${display}`;
};

const formatWalletTimestamp = (timestamp) => {
  const seconds = Number.parseInt(timestamp || "0", 10);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "Unknown date";
  }
  return new Date(seconds * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
};

async function loadWalletTransactions(walletContract, primaryAddress, limit = 8) {
  if (!walletContract || !primaryAddress) {
    return [];
  }

  const accountLower = normalizeAddress(primaryAddress);
  const txIds = await walletContract.methods.getAccountTransactions(primaryAddress).call();
  if (!txIds || !txIds.length) {
    return [];
  }

  const recentIds = txIds.slice(-limit).reverse();
  const records = await Promise.all(
    recentIds.map((txId) => walletContract.methods.getTransaction(txId).call())
  );

  return records.map((record) => {
    const typeIndex = Number(record.txType);
    const typeLabel = WALLET_TX_TYPE_LABELS[typeIndex] || "Activity";
    const from = normalizeAddress(record.from);
    const to = normalizeAddress(record.to);
    const outgoing = from === accountLower && to !== accountLower;
    const amount = formatWalletAmount(record.amount, outgoing);
    const reference =
      record.txReference && record.txReference !== "0x0000000000000000000000000000000000000000000000000000000000000000"
        ? record.txReference
        : "";

    return {
      type: typeLabel,
      date: formatWalletTimestamp(record.timestamp),
      amount,
      status: "completed",
      direction: outgoing ? "out" : "in",
      reference
    };
  });
}

async function buildWalletSnapshot(targetAccount) {
  if (!targetAccount) {
    return buildEmptyWalletSnapshot();
  }

  if (!web3Instance) {
    return {
      ...buildEmptyWalletSnapshot(),
      address: targetAccount
    };
  }

  try {
    const primaryAddress = targetAccount;
    const balanceWei = primaryAddress ? await web3Instance.eth.getBalance(primaryAddress) : "0";
    const ethBalance = parseFloat(web3Instance.utils.fromWei(balanceWei || "0", "ether")) || 0;
    let tokenBalance = ethBalance;
    let transactions = [];

    if (primaryAddress && WALLET_CONTRACT_ADDRESS) {
      const walletContract = resolveWalletContract();
      if (walletContract) {
        const ledgerBalance = await walletContract.methods.balanceOf(primaryAddress).call();
        tokenBalance = parseFloat(web3Instance.utils.fromWei(ledgerBalance || "0", "ether")) || tokenBalance;
        transactions = await loadWalletTransactions(walletContract, primaryAddress);
      }
    }

    const totalsUsd = ethBalance * ETH_USD_RATE;
    const tokenUsdValue = tokenBalance * ETH_USD_RATE;

    const snapshot = {
      totalBalance: ethBalance.toFixed(4),
      symbol: WALLET_TOKEN_SYMBOL,
      ethBalance: ethBalance.toFixed(4),
      ethUsd: formatUsd(totalsUsd),
      tokenBalance: tokenBalance.toFixed(4),
      tokenUsd: formatUsd(tokenUsdValue),
      address: primaryAddress || "Not connected",
      token: {
        name: WALLET_TOKEN_NAME,
        symbol: WALLET_TOKEN_SYMBOL,
        contractAddress: WALLET_CONTRACT_ADDRESS || "Not configured",
        totalSupply: WALLET_TOTAL_SUPPLY,
        standard: WALLET_TOKEN_STANDARD
      },
      transactions
    };

    return snapshot;
  } catch (error) {
    console.error("Unable to build wallet snapshot:", error);
    return {
      ...buildEmptyWalletSnapshot(),
      address: targetAccount
    };
  }
}
 
// Define routes - home page
app.get('/', async(req, res) => {   
    console.log("Shipping Tracker Home Page");
    await componentWillMount();
    try {
      const liveProducts = await getProductsForView();
      const featuredProducts = liveProducts.slice(0, 4);
      res.render('index', {
        acct: account,
        cnt: shipmentCount,
        shipments: [],
        products: featuredProducts,
        status: loading,
        addObject: null,
        addFunction: null,
        addStatus: false,
        featuredProducts: featuredProducts
      });
    } catch (error) {
        console.error('Error in home route:', error);
        res.status(500).send('Server error');
    }
});

app.get('/products', async (req, res) => {
  const liveProducts = await getProductsForView();
  res.render('products', {
    acct: account,
    products: liveProducts,
    status: loading
  });
});

app.get('/about', (req, res) => {
  res.render('about', { acct: account });
});

app.get('/login', (req, res) => {
  res.render('login', { acct: account, next: req.query.next || "" });
});

app.get('/admin-login', (req, res) => {
  res.render('admin-login', { acct: account });
});

app.post('/login', (req, res) => {
  const { email, password, role, next: nextPath } = req.body;

  if (!email || !password) {
    return res.redirect('/login');
  }

  if (role === "admin") {
    const isAdmin = email === "main@gmail.com" && password === "123456";
    if (!isAdmin) {
      return res.redirect('/login');
    }
  }

  req.session.user = {
    email,
    role: role === "admin" ? "admin" : "user"
  };
  loadCartFromStore(req);

  const redirectTo = typeof nextPath === "string" && nextPath ? nextPath : "/wallet";
  return res.redirect(redirectTo);
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

app.get('/register', (req, res) => {
  res.render('register', { acct: account });
});

app.post('/register', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.redirect('/register');
  }

  req.session.user = {
    email,
    role: "user"
  };
  loadCartFromStore(req);

  return res.redirect('/wallet');
});

app.get('/wallet', requireLogin, async (req, res) => {
  try {
    const wallet = await buildWalletSnapshot(account);
    return res.render('wallet', { acct: account, wallet });
  } catch (error) {
    console.error('Error rendering wallet:', error);
    return res.status(500).send('Unable to load wallet data');
  }
});

app.get('/api/wallet', requireLogin, async (req, res) => {
  const accountAddress = String(req.query.account || "").trim();

  if (!accountAddress || !accountAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
    return res.status(400).json({
      success: false,
      message: "Invalid account address"
    });
  }

  try {
    const wallet = await buildWalletSnapshot(accountAddress);
    return res.json(wallet);
  } catch (error) {
    console.error("Error building wallet snapshot:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to load wallet data"
    });
  }
});

app.get('/admin', requireAdmin, async (req, res) => {
  const liveProducts = await getProductsForView();
  res.render('admin-dashboard', { acct: account, products: liveProducts });
});

app.get('/api/orders', requireAdmin, async (req, res) => {
  try {
    if (!contractInstance || !web3Instance) {
      return res.status(400).json({
        success: false,
        message: 'Web3 not connected'
      });
    }

    const ids = await contractInstance.methods.getSellerShipments(sellerAddress).call();
    if (!ids || !ids.length) {
      return res.json({ success: true, orders: [] });
    }

    const statusLabels = ["Pending", "Picked Up", "In Transit", "Out For Delivery", "Delivered", "Failed"];
    const orders = await Promise.all(
      ids.map(async (trackingId) => {
        const shipmentData = await contractInstance.methods.getShipment(trackingId).call();
        const status = await contractInstance.methods.getShipmentStatus(trackingId).call();
        return {
          trackingId,
          seller: shipmentData.seller,
          buyer: shipmentData.buyer,
          recipientName: shipmentData.recipientName,
          recipientAddress: shipmentData.recipientAddress,
          itemDescription: shipmentData.itemDescription,
          shipmentValue: web3Instance.utils.fromWei(shipmentData.shipmentValue, 'ether'),
          createdAt: new Date(parseInt(shipmentData.createdAt, 10) * 1000).toISOString(),
          statusCode: Number(status[0]),
          statusLabel: statusLabels[Number(status[0])] || "Pending",
          lastUpdateTime: new Date(parseInt(status[1], 10) * 1000).toISOString()
        };
      })
    );

    return res.json({ success: true, orders });
  } catch (error) {
    console.error('Error loading orders:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unable to load orders'
    });
  }
});

app.get('/api/orders/user', requireLogin, async (req, res) => {
  try {
    if (!contractInstance || !web3Instance) {
      return res.status(400).json({
        success: false,
        message: 'Web3 not connected'
      });
    }

    if (!account) {
      return res.status(400).json({
        success: false,
        message: 'No MetaMask account connected'
      });
    }

    const ids = await contractInstance.methods.getBuyerShipments(account).call();
    if (!ids || !ids.length) {
      return res.json({ success: true, orders: [] });
    }

    const statusLabels = ["Pending", "Picked Up", "In Transit", "Out For Delivery", "Delivered", "Failed"];
    const orders = await Promise.all(
      ids.map(async (trackingId) => {
        const shipmentData = await contractInstance.methods.getShipment(trackingId).call();
        const status = await contractInstance.methods.getShipmentStatus(trackingId).call();
        return {
          trackingId,
          seller: shipmentData.seller,
          buyer: shipmentData.buyer,
          recipientName: shipmentData.recipientName,
          recipientAddress: shipmentData.recipientAddress,
          itemDescription: shipmentData.itemDescription,
          shipmentValue: web3Instance.utils.fromWei(shipmentData.shipmentValue, 'ether'),
          createdAt: new Date(parseInt(shipmentData.createdAt, 10) * 1000).toISOString(),
          statusCode: Number(status[0]),
          statusLabel: statusLabels[Number(status[0])] || "Pending",
          lastUpdateTime: new Date(parseInt(status[1], 10) * 1000).toISOString()
        };
      })
    );

    return res.json({ success: true, orders });
  } catch (error) {
    console.error('Error loading user orders:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unable to load orders'
    });
  }
});

app.get('/api/reviews/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Missing product id'
      });
    }
    const contract = await getReviewContract();
    if (!contract) {
      return res.status(500).json({
        success: false,
        message: 'Review contract not available'
      });
    }
    const reviews = await contract.methods.getReviews(productId).call();
    return res.json({ success: true, reviews: reviews || [] });
  } catch (error) {
    console.error('Error loading reviews:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unable to load reviews'
    });
  }
});

app.get('/documents', requireLogin, (req, res) => {
  res.render('documents', { acct: account });
});

app.get('/orders', requireLogin, (req, res) => {
  res.render('orders', { acct: account });
});

// Add product page
app.get('/addproduct', requireAdmin, (req, res) => {
  res.render('addProduct', {
    acct: account,
    products: products,
    status: loading,
    addObject: null,
    addFunction: null,
    addStatus: false,
    error: null,
    formData: {}
  });
});

app.post('/addproduct', requireAdmin, (req, res) => {
  return res.status(400).render('addProduct', {
    acct: account,
    products: products,
    status: loading,
    addObject: null,
    addFunction: null,
    addStatus: false,
    error: 'Use the on-chain add flow with MetaMask to create products.',
    formData: req.body
  });
});

app.get('/product/:id', async (req, res) => {
  const { id } = req.params;
  const liveProducts = await getProductsForView();
  const product = liveProducts.find((item) => item.id === id);
  if (!product) {
    return res.redirect('/products');
  }
  let reviews = [];
  const ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  try {
    const reviewContract = await getReviewContract();
    if (reviewContract) {
      const onChainReviews = await reviewContract.methods.getReviews(product.id).call();
      reviews = (onChainReviews || []).map((review) => {
        const ratingValue = Number(review.rating || 0);
        if (ratingValue >= 1 && ratingValue <= 5) {
          ratingCounts[ratingValue] += 1;
        }
        const buyer = String(review.buyer || "");
        return {
          reviewerName: buyer ? `${buyer.slice(0, 6)}...${buyer.slice(-4)}` : "On-chain buyer",
          rating: ratingValue,
          date: new Date(Number(review.timestamp) * 1000).toLocaleDateString("en-GB"),
          title: "On-chain review",
          comment: review.commentHash || "",
          photoHash: review.photoHash || "",
          verifiedPurchase: true,
          helpfulVotes: 0,
          blockchainTxHash: review.deliveryTxHash || "0x"
        };
      });
    } else {
      reviews = mockReviews;
      reviews.forEach((review) => {
        ratingCounts[review.rating] += 1;
      });
    }
  } catch (error) {
    console.warn("Unable to load on-chain reviews:", error.message || error);
    reviews = mockReviews;
    reviews.forEach((review) => {
      ratingCounts[review.rating] += 1;
    });
  }

  const totalReviews = reviews.length || 1;
  const ratingDistribution = {};
  for (let i = 1; i <= 5; i += 1) {
    ratingDistribution[i] = Math.round((ratingCounts[i] / totalReviews) * 100);
  }

  const ratedReviews = reviews.filter((review) => Number(review.rating) > 0);
  const averageRating = ratedReviews.length
    ? ratedReviews.reduce((sum, review) => sum + (Number(review.rating) || 0), 0) / ratedReviews.length
    : product.rating || 0;

  let sellerReputation = null;
  try {
    const reputationContract = await getReputationContract();
    if (reputationContract) {
      const rep = await reputationContract.methods.getSellerReputation(sellerAddress).call();
      const percent = Number(rep.reputationPercent || 0);
      sellerReputation = {
        percent,
        totalRatings: Number(rep.totalRatings || 0),
        totalSales: Number(rep.totalSales || 0),
        verified: Boolean(rep.verified)
      };
      product.seller.rating = percent ? Math.round((percent / 20) * 10) / 10 : product.seller.rating;
      product.seller.sales = sellerReputation.totalSales || product.seller.sales;
      product.seller.verified = sellerReputation.verified;
    }
  } catch (error) {
    console.warn("Unable to load seller reputation:", error.message || error);
  }

  res.render('product', {
    acct: account,
    product,
    reviews,
    ratingCounts,
    ratingDistribution,
    returnTo: req.originalUrl,
    averageRating,
    reviewCount: reviews.length,
    sellerReputation
  });
});

app.post('/api/products/tx/create', requireAdmin, express.json(), async (req, res) => {
  try {
    const { name, description, price, imageUrl, category, account: from } = req.body;
    const contract = await getProductContract();

    if (!contract || !web3Instance) {
      return res.status(500).json({
        success: false,
        message: 'Product contract not available'
      });
    }

    if (!from || !from.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Missing or invalid admin account'
      });
    }

    if (!name || !description || !price) {
      return res.status(400).json({
        success: false,
        message: 'Name, description, and price are required'
      });
    }

    const priceValue = Number(price);
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Price must be a valid number greater than 0'
      });
    }

    if (priceValue > MAX_PRODUCT_PRICE_ETH) {
      return res.status(400).json({
        success: false,
        message: `Price must be ${MAX_PRODUCT_PRICE_ETH} ETH or less`
      });
    }

    const priceWei = web3Instance.utils.toWei(String(price), 'ether');
    const productId = web3Instance.utils.keccak256(
      `${name}-${Date.now()}-${from}`
    );
    const cleanImage = imageUrl || '/images/default-product.jpeg';
    const cleanCategory = category || 'Verified';
    const tx = contract.methods.addProduct(
      productId,
      name,
      description,
      cleanImage,
      cleanCategory,
      priceWei
    );
    const gasEstimate = await tx.estimateGas({ from });
    const gasPrice = await getPreferredGasPrice();

    return res.json({
      success: true,
      productId,
      txData: {
        from,
        to: contract.options.address,
        data: tx.encodeABI(),
        gas: toHexQuantity(gasEstimate),
        ...(gasPrice && !isZeroQuantity(gasPrice) ? { gasPrice: toHexQuantity(gasPrice) } : {})
      }
    });
  } catch (error) {
    console.error('Error preparing product add:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unable to prepare transaction'
    });
  }
});

app.post('/api/products/tx/delete', requireAdmin, express.json(), async (req, res) => {
  try {
    const { productId, account: from } = req.body;
    const contract = await getProductContract();

    if (!contract || !web3Instance) {
      return res.status(500).json({
        success: false,
        message: 'Product contract not available'
      });
    }

    if (!from || !from.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Missing or invalid admin account'
      });
    }

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    const tx = contract.methods.removeProduct(productId);
    const gasEstimate = await tx.estimateGas({ from });
    const gasPrice = await web3Instance.eth.getGasPrice();

    return res.json({
      success: true,
      txData: {
        from,
        to: contract.options.address,
        data: tx.encodeABI(),
        gas: toHexQuantity(gasEstimate),
        ...(gasPrice && !isZeroQuantity(gasPrice) ? { gasPrice: toHexQuantity(gasPrice) } : {})
      }
    });
  } catch (error) {
    console.error('Error preparing product delete:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unable to prepare transaction'
    });
  }
});

// Shipping tracker page 
app.get("/shipping/tracker", requireLogin, (req, res) => {
  res.render("tracking", { acct: account });
});

function getCart(req) {
  if (!req.session.cart) {
    req.session.cart = { items: {} };
  }
  return req.session.cart;
}

app.post('/cart/add', requireLogin, async (req, res) => {
  const { productId, quantity } = req.body;
  const liveProducts = await getProductsForView();
  const product = liveProducts.find((item) => item.id === productId);
  if (!product) {
    return res.status(404).send('Product not found');
  }

  const qty = Math.max(1, Number.parseInt(quantity || '1', 10));
  const cart = getCart(req);
  cart.items[productId] = (cart.items[productId] || 0) + qty;
  req.session.cart = cart;
  syncCartToStore(req);
  return res.redirect('/cart');
});

app.get('/cart', requireLogin, async (req, res) => {
  const { cartItems, totalEth } = await buildCartSummary(req);

  res.render('cart', {
    acct: account,
    cartItems: cartItems,
    totalEth: totalEth
  });
});

app.get('/checkout', requireLogin, async (req, res) => {
  const { cartItems, totalEth } = await buildCartSummary(req);
  res.render('checkout', {
    acct: account,
    cartItems,
    totalEth,
    userEmail: req.session && req.session.user ? req.session.user.email : null
  });
});

app.post('/cart/remove', requireLogin, (req, res) => {
  const { productId } = req.body;
  const cart = getCart(req);
  if (productId && cart.items[productId]) {
    delete cart.items[productId];
  }
  req.session.cart = cart;
  syncCartToStore(req);
  return res.redirect('/cart');
});

app.post('/cart/clear', requireLogin, (req, res) => {
  req.session.cart = { items: {} };
  syncCartToStore(req);
  return res.redirect('/cart');
});

// Initialize Web3 connection and contract
app.post('/web3Connect', express.json(), async (req, res) => {
  try {
    const { contractAddress, acct, providerUrl } = req.body;
    console.log("Connecting to Web3...");
    console.log("Contract Address:", contractAddress);
    console.log("Account:", acct);
    
    // Validate inputs
    if (!acct) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: acct'
      });
    }
    
    // Validate Ethereum address format
    if (!acct.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Ethereum address format'
      });
    }
    
    // Validate contract address format if provided
    if (contractAddress && !contractAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid contract address format'
      });
    }
    
    account = acct;
    
    // Initialize Web3 if not already done
    // For MetaMask: use window.ethereum provider from frontend, or fall back to http provider
    const resolvedProviderUrl = providerUrl || WEB3_PROVIDER_URL || 'http://localhost:8545';
    web3Instance = new Web3(resolvedProviderUrl);
    
    let resolvedContractAddress = contractAddress;
    let contractJSON = null;
    try {
      contractJSON = JSON.parse(
        fs.readFileSync('public/build/ShippingTrackerContract.json', 'utf8')
      );
    } catch (readErr) {
      contractJSON = null;
    }

    if (!resolvedContractAddress && contractJSON) {
      const networkId = await web3Instance.eth.net.getId();
      const networkData = contractJSON.networks ? contractJSON.networks[networkId] : null;
      resolvedContractAddress = networkData && networkData.address ? networkData.address : "";
    }

    if (resolvedContractAddress && contractJSON && contractJSON.abi) {
      // Load contract ABI
      contractInstance = new web3Instance.eth.Contract(contractJSON.abi, resolvedContractAddress);

      // Get shipment count
      const count = await contractInstance.methods.getShipmentCount().call();
      shipmentCount = parseInt(count);
    } else {
      contractInstance = null;
      shipmentCount = 0;
    }
    
    loading = false;
    
    res.json({
      success: true,
      message: 'Connected to blockchain with MetaMask',
      shipmentCount: shipmentCount,
      connectedAccount: account
    });
  } catch (error) {
      console.error('Error in web3Connect:', error);
      res.status(500).json({
          success: false,
          message: error.message
      });
  }
});

// Get all shipments for current account
app.get('/shipments', async (req, res) => {
  try {
    if (!contractInstance || !account) {
      return res.status(400).json({
        success: false,
        message: 'Web3 not connected'
      });
    }
    
    const shipmentIds = await contractInstance.methods.getSellerShipments(account).call();
    
    const shipmentList = [];
    for (let id of shipmentIds) {
      const shipmentData = await contractInstance.methods.getShipment(id).call();
      const status = await contractInstance.methods.getShipmentStatus(id).call();
      const updates = await contractInstance.methods.getShipmentUpdates(id).call();
      
      shipmentList.push({
        trackingId: id,
        shipment: shipmentData,
        currentStatus: status[0],
        lastUpdateTime: status[1],
        updates: updates
      });
    }
    
    res.json({
      success: true,
      shipments: shipmentList
    });
  } catch (error) {
    console.error('Error fetching shipments:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get loading status
app.get('/loading-status', (req, res) => {
  res.json({ loading: loading });
});

// Create new shipment
app.post('/createShipment', express.json(), async (req, res) => {
  try {
    const {
      trackingId,
      recipientName,
      recipientAddress,
      itemDescription,
      shipmentValue,
      useCartTotal
    } = req.body;
    
    if (!contractInstance) {
      return res.status(400).json({
        success: false,
        message: 'Web3 not connected'
      });
    }
    
    // Validate inputs
    if (!trackingId || !shipmentValue) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: trackingId, shipmentValue'
      });
    }
    
    // Resolve shipment value from cart when requested
    let resolvedShipmentValue = shipmentValue;
    if (useCartTotal) {
      const summary = await buildCartSummary(req);
      if (!summary.cartItems || summary.cartItems.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Cart is empty'
        });
      }
      resolvedShipmentValue = summary.totalEth;
    }

    const shipmentValueNum = parseFloat(resolvedShipmentValue);
    if (!Number.isFinite(shipmentValueNum) || shipmentValueNum <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Shipment value must be greater than 0'
      });
    }
    if (shipmentValueNum > MAX_PRODUCT_PRICE_ETH) {
      return res.status(400).json({
        success: false,
        message: `Shipment value must be ${MAX_PRODUCT_PRICE_ETH} ETH or less`
      });
    }
    
    // Call smart contract method
    const senderName = "TrustedLedger Seller";
    const senderAddress = "Seller warehouse";
    const safeRecipientName = recipientName && recipientName.trim()
      ? recipientName.trim()
      : "Marketplace Customer";
    const safeRecipientAddress = recipientAddress && recipientAddress.trim()
      ? recipientAddress.trim()
      : "Address on file";

    const tx = contractInstance.methods.createShipment(
      trackingId,
      senderName,
      senderAddress,
      safeRecipientName,
      safeRecipientAddress,
      itemDescription,
      web3Instance.utils.toWei(String(resolvedShipmentValue), 'ether')
    );
    
    // Prepare transaction for MetaMask
    const value = web3Instance.utils.toWei(String(resolvedShipmentValue), 'ether');
    const gasEstimate = await tx.estimateGas({ from: account, value: value });
    const gasPrice = await getPreferredGasPrice();
    
    const txData = {
      from: account,
      to: contractInstance.options.address,
      data: tx.encodeABI(),
      value: toHexQuantity(value),
      gas: toHexQuantity(gasEstimate),
      ...(gasPrice && !isZeroQuantity(gasPrice) ? { gasPrice: toHexQuantity(gasPrice) } : {})
    };
    
    console.log('Shipment creation requested:', trackingId);
    console.log('Shipment value ETH:', resolvedShipmentValue, 'wei:', value, 'tx value:', toHexQuantity(value));
    
    res.json({
      success: true,
      message: 'Shipment creation initiated',
      txData: txData,
      trackingId: trackingId,
      seller: sellerAddress,
      estimatedGas: gasEstimate.toString(),
      estimatedGasPrice: gasPrice ? gasPrice.toString() : "auto",
      resolvedShipmentValue: String(resolvedShipmentValue)
    });
  } catch (error) {
    console.error('Error creating shipment:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Track shipment by tracking ID
app.get('/track/:trackingId', async (req, res) => {
  try {
    const { trackingId } = req.params;
    
    if (!contractInstance) {
      return res.status(400).json({
        success: false,
        message: 'Web3 not connected'
      });
    }
    
    // Validate tracking ID
    if (!trackingId || trackingId.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Tracking ID cannot be empty'
      });
    }
    
    try {
      const shipmentData = await contractInstance.methods.getShipment(trackingId).call();
      const status = await contractInstance.methods.getShipmentStatus(trackingId).call();
      const updates = await contractInstance.methods.getShipmentUpdates(trackingId).call();
      
      // Format timestamp to readable date
      const formattedUpdates = updates.map(update => ({
        status: update.status,
        location: update.location,
        timestamp: new Date(parseInt(update.timestamp) * 1000).toISOString(),
        notes: update.notes
      }));
      
      res.json({
        success: true,
        shipment: {
          trackingId: trackingId,
          seller: shipmentData.seller,
          buyer: shipmentData.buyer,
          senderName: shipmentData.senderName,
          senderAddress: shipmentData.senderAddress,
          recipientName: shipmentData.recipientName,
          recipientAddress: shipmentData.recipientAddress,
          itemDescription: shipmentData.itemDescription,
          shipmentValue: web3Instance.utils.fromWei(shipmentData.shipmentValue, 'ether'),
          createdAt: new Date(parseInt(shipmentData.createdAt) * 1000).toISOString(),
          paymentReleased: shipmentData.paymentReleased
        },
        currentStatus: status[0],
        lastUpdateTime: new Date(parseInt(status[1]) * 1000).toISOString(),
        updates: formattedUpdates
      });
    } catch (contractError) {
      return res.status(404).json({
        success: false,
        message: 'Shipment not found with tracking ID: ' + trackingId
      });
    }
  } catch (error) {
    console.error('Error tracking shipment:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Shipping tracker UI data
app.get('/api/shipping/:trackingId', async (req, res) => {
  try {
    const { trackingId } = req.params;
    if (!contractInstance) {
      return res.status(400).json({
        success: false,
        message: 'Web3 not connected'
      });
    }

    if (!account) {
      return res.status(400).json({
        success: false,
        message: 'No MetaMask account connected'
      });
    }
    if (!trackingId || trackingId.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Tracking ID cannot be empty'
      });
    }

    const shipmentData = await contractInstance.methods.getShipment(trackingId).call();
    const status = await contractInstance.methods.getShipmentStatus(trackingId).call();
    const updates = await contractInstance.methods.getShipmentUpdates(trackingId).call();

    const statusLabels = ["Pending", "Picked Up", "In Transit", "Out For Delivery", "Delivered", "Failed"];
    const lastUpdateIso = new Date(parseInt(status[1], 10) * 1000).toISOString();
    const events = updates.map((update) => ({
      title: statusLabels[update.status] || "Status Update",
      location: update.location,
      timestamp: new Date(parseInt(update.timestamp, 10) * 1000).toISOString(),
      notes: update.notes
    }));

    res.json({
      smartContractId: contractInstance.options.address,
      lastVerified: lastUpdateIso,
      deliveryMethod: "Blockchain Logistics",
      estimatedDelivery: "3-5 business days",
      trackingLabel: "Real-time blockchain tracking",
      shipmentValue: web3Instance.utils.fromWei(shipmentData.shipmentValue, 'ether'),
      buyer: shipmentData.buyer,
      seller: shipmentData.seller,
      currentStatus: statusLabels[status[0]] || "Pending",
      currentStatusCode: Number(status[0]),
      events: events
    });
  } catch (error) {
    console.error('Error loading shipping tracker:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Update shipment status (Admin only)
app.post('/updateStatus/:trackingId', express.json(), async (req, res) => {
  try {
    const { trackingId } = req.params;
    const { status, location, notes } = req.body;
    
    if (!contractInstance) {
      return res.status(400).json({
        success: false,
        message: 'Web3 not connected'
      });
    }
    
    // Validate inputs
    if (status === undefined || status === null || !location) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: status, location'
      });
    }
    
    // Validate status is a valid enum value (0-5)
    if (status < 0 || status > 5) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value. Must be between 0-5 (Pending, Picked_Up, In_Transit, Out_For_Delivery, Delivered, Failed)'
      });
    }
    
    const tx = contractInstance.methods.updateShipmentStatus(
      trackingId,
      status,
      location,
      notes || ''
    );
    
    // Prepare transaction for MetaMask
    const gasEstimate = await tx.estimateGas({ from: account });
    const gasPrice = await web3Instance.eth.getGasPrice();
    
    const txData = {
      from: account,
      to: contractInstance.options.address,
      data: tx.encodeABI(),
      gas: toHexQuantity(gasEstimate),
      ...(gasPrice && !isZeroQuantity(gasPrice) ? { gasPrice: toHexQuantity(gasPrice) } : {})
    };
    
    console.log('Status update for tracking ID:', trackingId);
    
    res.json({
      success: true,
      message: 'Status update initiated',
      txData: txData,
      timestamp: new Date().toISOString(),
      estimatedGas: gasEstimate.toString(),
      estimatedGasPrice: gasPrice.toString()
    });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Confirm delivery and release payment
app.post('/confirmDelivery/:trackingId', express.json(), async (req, res) => {
  try {
    const { trackingId } = req.params;
    
    if (!contractInstance) {
      return res.status(400).json({
        success: false,
        message: 'Web3 not connected'
      });
    }
    
    // Validate tracking ID
    if (!trackingId || trackingId.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Tracking ID cannot be empty'
      });
    }
    
    const tx = contractInstance.methods.confirmDeliveryAndReleasePayment(trackingId);
    
    const gasEstimate = await tx.estimateGas({ from: account });
    const gasPrice = await web3Instance.eth.getGasPrice();
    
    const txData = {
      from: account,
      to: contractInstance.options.address,
      data: tx.encodeABI(),
      gas: toHexQuantity(gasEstimate),
      ...(gasPrice && !isZeroQuantity(gasPrice) ? { gasPrice: toHexQuantity(gasPrice) } : {})
    };
    
    console.log('Delivery confirmation for tracking ID:', trackingId);
    
    res.json({
      success: true,
      message: 'Delivery confirmation initiated and payment will be released',
      txData: txData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error confirming delivery:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Buyer confirms delivery with optional review/comment/photo hash
app.post('/confirmDeliveryByBuyer/:trackingId', express.json(), async (req, res) => {
  try {
    const { trackingId } = req.params;
    const { rating, commentHash, photoHash } = req.body || {};

    if (!contractInstance) {
      return res.status(400).json({
        success: false,
        message: 'Web3 not connected'
      });
    }

    if (!trackingId || trackingId.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Tracking ID cannot be empty'
      });
    }

    const ratingValue = Number.isFinite(Number(rating)) ? Number(rating) : 0;
    if (ratingValue < 0 || ratingValue > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 0-5'
      });
    }

    const tx = contractInstance.methods.confirmDeliveryByBuyer(
      trackingId,
      ratingValue,
      String(commentHash || ""),
      String(photoHash || "")
    );

    const gasEstimate = await tx.estimateGas({ from: account });
    const gasPrice = await web3Instance.eth.getGasPrice();

    const txData = {
      from: account,
      to: contractInstance.options.address,
      data: tx.encodeABI(),
      gas: toHexQuantity(gasEstimate),
      ...(gasPrice && !isZeroQuantity(gasPrice) ? { gasPrice: toHexQuantity(gasPrice) } : {})
    };

    return res.json({
      success: true,
      message: 'Delivery confirmation prepared',
      txData: txData
    });
  } catch (error) {
    console.error('Error confirming delivery by buyer:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unable to confirm delivery'
    });
  }
});

// Prepare on-chain review transaction
app.post('/api/reviews/tx', express.json(), async (req, res) => {
  try {
    const { productId, trackingId, rating, commentHash, photoHash } = req.body || {};
    if (!productId || !trackingId) {
      return res.status(400).json({
        success: false,
        message: 'Missing productId or trackingId'
      });
    }

    const reviewContract = await getReviewContract();
    if (!reviewContract) {
      return res.status(500).json({
        success: false,
        message: 'Review contract not available'
      });
    }

    const ratingValue = Number.isFinite(Number(rating)) ? Number(rating) : 0;
    if (ratingValue < 0 || ratingValue > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 0-5'
      });
    }

    const purchaseId = web3Instance.utils.keccak256(String(trackingId));
    const deliveryTxHash = web3Instance.utils.keccak256(`delivery:${trackingId}`);

    const tx = reviewContract.methods.submitReview(
      productId,
      purchaseId,
      ratingValue,
      String(commentHash || ""),
      String(photoHash || ""),
      deliveryTxHash
    );

    const gasEstimate = await tx.estimateGas({ from: account });
    const gasPrice = await web3Instance.eth.getGasPrice();

    const txData = {
      from: account,
      to: reviewContract.options.address,
      data: tx.encodeABI(),
      gas: toHexQuantity(gasEstimate),
      ...(gasPrice && !isZeroQuantity(gasPrice) ? { gasPrice: toHexQuantity(gasPrice) } : {})
    };

    return res.json({
      success: true,
      message: 'Review transaction prepared',
      txData
    });
  } catch (error) {
    console.error('Error preparing review tx:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unable to prepare review transaction'
    });
  }
});

// Prepare seller reputation update transaction
app.post('/api/reputation/tx', express.json(), async (req, res) => {
  try {
    const { seller, trackingId, rating } = req.body || {};
    if (!seller || !trackingId) {
      return res.status(400).json({
        success: false,
        message: 'Missing seller or trackingId'
      });
    }

    const reputationContract = await getReputationContract();
    if (!reputationContract) {
      return res.status(500).json({
        success: false,
        message: 'Reputation contract not available'
      });
    }

    const ratingValue = Number.isFinite(Number(rating)) ? Number(rating) : 0;
    if (ratingValue < 1 || ratingValue > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1-5'
      });
    }

    const orderId = web3Instance.utils.keccak256(String(trackingId));
    const tx = reputationContract.methods.rateSeller(
      seller,
      orderId,
      ratingValue,
      ratingValue,
      ratingValue,
      ratingValue
    );

    const gasEstimate = await tx.estimateGas({ from: account });
    const gasPrice = await web3Instance.eth.getGasPrice();

    const txData = {
      from: account,
      to: reputationContract.options.address,
      data: tx.encodeABI(),
      gas: toHexQuantity(gasEstimate),
      ...(gasPrice && !isZeroQuantity(gasPrice) ? { gasPrice: toHexQuantity(gasPrice) } : {})
    };

    return res.json({
      success: true,
      message: 'Reputation transaction prepared',
      txData
    });
  } catch (error) {
    console.error('Error preparing reputation tx:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unable to prepare reputation transaction'
    });
  }
});

app.post('/api/invoices/tx/register', express.json(), async (req, res) => {
  try {
    const { trackingId, invoiceHash } = req.body || {};
    if (!trackingId || !invoiceHash) {
      return res.status(400).json({
        success: false,
        message: 'Missing trackingId or invoiceHash'
      });
    }

    const notaryContract = await getNotaryContract();
    if (!notaryContract) {
      return res.status(500).json({
        success: false,
        message: 'Document notary contract not available'
      });
    }

    const hashValue = String(invoiceHash).startsWith("0x")
      ? String(invoiceHash)
      : `0x${String(invoiceHash)}`;

    const tx = notaryContract.methods.registerInvoice(trackingId, hashValue);
    const gasEstimate = await tx.estimateGas({ from: account });
    const gasPrice = await web3Instance.eth.getGasPrice();

    const txData = {
      from: account,
      to: notaryContract.options.address,
      data: tx.encodeABI(),
      gas: toHexQuantity(gasEstimate),
      ...(gasPrice && !isZeroQuantity(gasPrice) ? { gasPrice: toHexQuantity(gasPrice) } : {})
    };

    return res.json({
      success: true,
      message: 'Invoice registration prepared',
      txData
    });
  } catch (error) {
    console.error('Error preparing invoice registration:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unable to prepare invoice registration'
    });
  }
});

app.post('/api/invoices/tx/attest', requireAdmin, express.json(), async (req, res) => {
  try {
    const { trackingId, authentic } = req.body || {};
    if (!trackingId || authentic === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Missing trackingId or authentic flag'
      });
    }

    const notaryContract = await getNotaryContract();
    if (!notaryContract) {
      return res.status(500).json({
        success: false,
        message: 'Document notary contract not available'
      });
    }

    const tx = notaryContract.methods.attestInvoice(trackingId, Boolean(authentic));
    const gasEstimate = await tx.estimateGas({ from: account });
    const gasPrice = await web3Instance.eth.getGasPrice();

    const txData = {
      from: account,
      to: notaryContract.options.address,
      data: tx.encodeABI(),
      gas: toHexQuantity(gasEstimate),
      ...(gasPrice && !isZeroQuantity(gasPrice) ? { gasPrice: toHexQuantity(gasPrice) } : {})
    };

    return res.json({
      success: true,
      message: 'Invoice attestation prepared',
      txData
    });
  } catch (error) {
    console.error('Error preparing invoice attestation:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unable to prepare invoice attestation'
    });
  }
});

app.post('/api/invoices/verify', upload.single('invoice'), async (req, res) => {
  try {
    const trackingId = String(req.body.trackingId || "");
    if (!trackingId) {
      return res.status(400).json({
        success: false,
        message: 'TrackingId required'
      });
    }
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: 'Invoice file required'
      });
    }

    const notaryContract = await getNotaryContract();
    if (!notaryContract) {
      return res.status(500).json({
        success: false,
        message: 'Document notary contract not available'
      });
    }

    const hashHex = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
    const onChain = await notaryContract.methods.getInvoice(trackingId).call();
    const chainHash = String(onChain.invoiceHash || "").toLowerCase();
    const submittedHash = `0x${hashHex}`.toLowerCase();
    const authentic = chainHash && chainHash !== "0x0000000000000000000000000000000000000000000000000000000000000000"
      ? chainHash === submittedHash
      : false;

    return res.json({
      success: true,
      authentic,
      invoiceHash: submittedHash,
      chainHash,
      status: Number(onChain.status || 0)
    });
  } catch (error) {
    console.error('Error verifying invoice:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unable to verify invoice'
    });
  }
});

app.get('/api/invoices/:trackingId', async (req, res) => {
  try {
    const trackingId = String(req.params.trackingId || "");
    if (!trackingId) {
      return res.status(400).json({
        success: false,
        message: 'TrackingId required'
      });
    }
    const notaryContract = await getNotaryContract();
    if (!notaryContract) {
      return res.status(500).json({
        success: false,
        message: 'Document notary contract not available'
      });
    }
    const invoice = await notaryContract.methods.getInvoice(trackingId).call();
    return res.json({ success: true, invoice });
  } catch (error) {
    console.error('Error loading invoice:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unable to load invoice'
    });
  }
});


