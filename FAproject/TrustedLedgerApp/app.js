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
const GANACHE_CHAIN_ID_FALLBACKS = new Set([5777, 1337]);
const AUTO_STATUS_ENABLED = String(process.env.AUTO_STATUS_ENABLED || "true").toLowerCase() === "true";
const AUTO_STATUS_INTERVAL_MS = Number(process.env.AUTO_STATUS_INTERVAL_MS) || 5 * 60 * 1000;
const AUTO_STATUS_ACCOUNT = process.env.AUTO_STATUS_ACCOUNT || "";

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
setInterval(autoAdvanceShipments, AUTO_STATUS_INTERVAL_MS);
// declare the global variables
let account = '';
let shipmentCount = 0;
let loading = true;
let web3Instance = new Web3(WEB3_PROVIDER_URL);
let contractInstance = null;
let walletContractInstance = null;
const upload = multer({ storage: multer.memoryStorage() });

// Cart data is stored on-chain via MarketplaceCart.

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

let products = [];

function ensureSessionCart(req) {
  if (!req.session) {
    return {};
  }
  if (!req.session.cart) {
    req.session.cart = {};
  }
  return req.session.cart;
}

function buildSessionCartSnapshot(req) {
  const cart = ensureSessionCart(req);
  const items = Object.entries(cart).map(([productId, entry]) => ({
    product: entry.product,
    quantity: entry.quantity,
    productId
  }));
  const total = items.reduce((sum, item) => {
    const price = Number(item.product?.productInfo?.price || 0);
    if (!Number.isFinite(price)) {
      return sum;
    }
    return sum + price * (item.quantity || 0);
  }, 0);
  return {
    items,
    totalEth: total.toFixed(4)
  };
}

function clearSessionCart(req) {
  if (req.session) {
    req.session.cart = {};
  }
}

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

async function fetchSellerReputation(targetAddress) {
  if (!targetAddress) {
    return null;
  }
  try {
    const reputationContract = await getReputationContract();
    if (!reputationContract) {
      return null;
    }
    const rep = await reputationContract.methods.getSellerReputation(targetAddress).call();
    const percent = Number(rep.reputationPercent || 0);
    return {
      percent,
      totalRatings: Number(rep.totalRatings || 0),
      totalSales: Number(rep.totalSales || 0),
      verified: Boolean(rep.verified)
    };
  } catch (error) {
    console.warn("Unable to load seller reputation:", error.message || error);
    return null;
  }
}

async function loadReviewStats(productId) {
  const ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let reviews = [];
  if (!productId) {
    return {
      reviews,
      ratingCounts,
      ratingDistribution,
      averageRating: 0,
      reviewCount: 0
    };
  }
  try {
    const reviewContract = await getReviewContract();
    if (reviewContract) {
      const [onChainReviews, reviewIds] = await Promise.all([
        reviewContract.methods.getReviews(productId).call(),
        reviewContract.methods.getReviewIds(productId).call()
      ]);
      reviews = (onChainReviews || []).map((review, index) => {
        const ratingValue = Number(review.rating || 0);
        if (ratingValue >= 1 && ratingValue <= 5) {
          ratingCounts[ratingValue] += 1;
        }
        const buyer = String(review.buyer || "");
        return {
          reviewId: reviewIds && reviewIds[index] !== undefined ? Number(reviewIds[index]) : index,
          reviewerName: buyer ? `${buyer.slice(0, 6)}...${buyer.slice(-4)}` : "On-chain buyer",
          rating: ratingValue,
          date: new Date(Number(review.timestamp) * 1000).toLocaleDateString("en-GB"),
          title: "On-chain review",
          comment: review.commentHash || "",
          photoHash: review.photoHash || "",
          verifiedPurchase: true,
          helpfulVotes: 0,
          blockchainTxHash: review.deliveryTxHash || "0x",
          adminReply: review.adminReply || "",
          replyTimestamp: review.replyTimestamp ? Number(review.replyTimestamp) : 0,
          replyAuthor: review.replyAuthor || ""
        };
      });
    }
  } catch (error) {
    console.warn("Unable to load on-chain reviews:", error.message || error);
    reviews = [];
  }

  const totalReviews = reviews.length || 1;
  for (let i = 1; i <= 5; i += 1) {
    ratingDistribution[i] = Math.round((ratingCounts[i] / totalReviews) * 100);
  }

  const ratedReviews = reviews.filter((review) => Number(review.rating) > 0);
  const averageRating = ratedReviews.length
    ? ratedReviews.reduce((sum, review) => sum + (Number(review.rating) || 0), 0) / ratedReviews.length
    : 0;

  return {
    reviews,
    ratingCounts,
    ratingDistribution,
    averageRating,
    reviewCount: reviews.length
  };
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
  const stockValue = Number.isFinite(Number(overrides.stock)) ? Number(overrides.stock) : 0;
  const statusText = overrides.status || (stockValue > 0 ? "In Stock" : "Out of Stock");
  return {
    seller: {
      name: overrides.sellerName || "On-chain seller",
      rating: 0,
      sales: 0,
      verified: false
    },
    stock: stockValue,
    status: statusText,
    fullDescription:
      overrides.fullDescription ||
      overrides.productInfo?.description ||
      "Verified marketplace listing anchored on-chain for authenticity and tracking.",
    features: overrides.features && overrides.features.length
      ? overrides.features
      : [
          "Blockchain verified authenticity",
          "Secure escrow-ready checkout",
          "TrustedLedger seller assurance"
        ],
    images: overrides.images && overrides.images.length
      ? overrides.images
      : ["/images/default-product.jpeg"],
    specifications: overrides.specifications && overrides.specifications.length
      ? overrides.specifications
      : [
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
        let features = [];
        let specLabels = [];
        let specValues = [];
        try {
          features = await contract.methods.getProductFeatures(id).call();
        } catch (error) {
          features = [];
        }
        try {
          const specs = await contract.methods.getProductSpecifications(id).call();
          specLabels = specs && specs[0] ? specs[0] : [];
          specValues = specs && specs[1] ? specs[1] : [];
        } catch (error) {
          specLabels = [];
          specValues = [];
        }
        const specifications = specLabels.map((label, index) => ({
          label,
          value: specValues[index] || ""
        }));
        const statusLabels = ["In Stock", "Limited Stock", "Out of Stock"];
        const statusText = statusLabels[Number(data.status)] || "In Stock";
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
            contractAddress: contract.options.address,
            sellerName: data.sellerName,
            stock: Number(data.stock || 0),
            status: statusText,
            fullDescription: data.fullDescription,
            features: Array.isArray(features) ? features : [],
            specifications
          }),
          ...base,
          sellerAddress: data.seller
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

const getAllowedGanacheChainIds = () => {
  const parsed = ganacheChainIds
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  const merged = new Set([...parsed, ...GANACHE_CHAIN_ID_FALLBACKS]);
  return Array.from(merged);
};

async function assertGanacheNetwork(web3) {
  if (!web3) {
    throw new Error("Web3 not initialized");
  }
  const chainIdValue = await web3.eth.getChainId();
  const chainId = Number(chainIdValue);
  const allowedChainIds = getAllowedGanacheChainIds();
  if (!allowedChainIds.includes(chainId)) {
    throw new Error(`Ganache chainId required. Detected ${chainId}. Allowed: ${allowedChainIds.join(", ")}`);
  }
  return chainId;
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
    await assertGanacheNetwork(web3);

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

async function ensureContractInstance() {
  if (contractInstance && web3Instance) {
    return contractInstance;
  }
  await loadBlockchainData();
  return contractInstance;
}

async function loadOrderItemsForTracking(trackingId) {
  if (!trackingId) {
    return [];
  }
  if (!contractInstance) {
    await ensureContractInstance();
  }
  if (!contractInstance) {
    return [];
  }
  const productContract = await getProductContract();
  let orderItems = [];
  try {
    const detailed = await contractInstance.methods.getOrderItemDetails(trackingId).call();
    if (Array.isArray(detailed) && detailed.length) {
      orderItems = detailed.map((item) => ({
        productId: item.productId,
        quantity: Number(item.quantity || 0),
        name: item.name || "",
        priceWei: item.priceWei || "0",
        imageUrl: item.imageUrl || ""
      }));
    }
  } catch (error) {
    orderItems = [];
  }

  if (!orderItems.length) {
    try {
      const orderItemData = await contractInstance.methods.getOrderItems(trackingId).call();
      const productIds = orderItemData && orderItemData[0] ? orderItemData[0] : [];
      const quantities = orderItemData && orderItemData[1] ? orderItemData[1] : [];
      orderItems = await Promise.all(
        productIds.map(async (productId, index) => {
          const qty = Number(quantities[index] || 0);
          let name = "";
          let priceWei = "0";
          let imageUrl = "";
          if (productContract) {
            try {
              const product = await productContract.methods.getProduct(productId).call();
              name = product.name || "";
              priceWei = product.priceWei || "0";
              imageUrl = product.imageUrl || "";
            } catch (error) {
              // fallback to defaults
            }
          }
          return {
            productId,
            quantity: qty,
            name,
            priceWei,
            imageUrl
          };
        })
      );
    } catch (error) {
      orderItems = [];
    }
  }

  return orderItems;
}

async function autoAdvanceShipments() {
  if (!AUTO_STATUS_ENABLED) {
    return;
  }
  if (!AUTO_STATUS_ACCOUNT || !AUTO_STATUS_ACCOUNT.match(/^0x[a-fA-F0-9]{40}$/)) {
    return;
  }
  try {
    await ensureContractInstance();
    if (!contractInstance || !web3Instance) {
      return;
    }
    const ids = await contractInstance.methods.getSellerShipments(sellerAddress).call();
    if (!ids || !ids.length) {
      return;
    }
    for (const trackingId of ids) {
      const status = await contractInstance.methods.getShipmentStatus(trackingId).call();
      const statusCode = Number(status[0]);
      if (!Number.isFinite(statusCode) || statusCode >= 4) {
        continue;
      }
      const nextStatus = statusCode + 1;
      const tx = contractInstance.methods.updateShipmentStatus(
        trackingId,
        nextStatus,
        "Automated status update",
        "Auto progress"
      );
      const gasEstimate = await tx.estimateGas({ from: AUTO_STATUS_ACCOUNT });
      const gasPrice = await getPreferredGasPrice();
      await tx.send({
        from: AUTO_STATUS_ACCOUNT,
        gas: gasEstimate,
        ...(gasPrice && !isZeroQuantity(gasPrice) ? { gasPrice } : {})
      });
    }
  } catch (error) {
    console.error("Auto status update failed:", error.message || error);
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

function requireUser(req, res, next) {
  if (req.session && req.session.user && req.session.user.role !== "admin") {
    return next();
  }
  return res.redirect("/admin");
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

const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

const isZeroBytes32 = (value) => {
  if (!value) {
    return true;
  }
  return String(value).toLowerCase() === ZERO_BYTES32;
};

const toJsonSafe = (value) => {
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
};

const toDeepJsonSafe = (value) => {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => toDeepJsonSafe(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [key, toDeepJsonSafe(val)])
    );
  }
  return value;
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

const toStringArray = (value) => {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }
    return trimmed.includes(",")
      ? trimmed.split(",").map((item) => item.trim()).filter(Boolean)
      : [trimmed];
  }
  if (typeof value === "object") {
    if (typeof value[Symbol.iterator] === "function") {
      return Array.from(value).filter(Boolean);
    }
    const length = Number.parseInt(value.length, 10);
    if (Number.isFinite(length) && length > 0) {
      const collection = [];
      for (let i = 0; i < length; i += 1) {
        if (value[i]) {
          collection.push(value[i]);
        }
      }
      if (collection.length) {
        return collection;
      }
    }
    return Object.values(value)
      .map((item) => (typeof item === "string" ? item.trim() : item))
      .filter((item) => item);
  }
  return [];
};

async function loadPaymentHistory(account, limit = 12) {
  if (!account) {
    return [];
  }
  try {
    await ensureContractInstance();
  } catch (error) {
    console.warn("Unable to ensure contract for payment history:", error.message || error);
    return [];
  }
  if (!contractInstance || !web3Instance) {
    return [];
  }
  const accountLower = normalizeAddress(account);
  const [sellerIds, buyerIds] = await Promise.all([
    contractInstance.methods.getSellerShipments(account).call().catch(() => []),
    contractInstance.methods.getBuyerShipments(account).call().catch(() => [])
  ]);
  const sellerList = toStringArray(sellerIds);
  const buyerList = toStringArray(buyerIds);
  const uniqueIds = new Set([...sellerList, ...buyerList]);
  const entries = [];
  for (const trackingId of uniqueIds) {
    try {
      const [statusCode, statusTimestamp] = await contractInstance.methods.getShipmentStatus(trackingId).call();
      const shipment = await contractInstance.methods.getShipment(trackingId).call();
      const isBuyer = normalizeAddress(shipment.buyer) === accountLower;
      const isSeller = normalizeAddress(shipment.seller) === accountLower;
      if (!isBuyer && !isSeller) {
        continue;
      }
      const timestamp = Number(statusTimestamp || shipment.createdAt || 0);
      const direction = isBuyer ? "out" : "in";
      const amountWei = shipment.shipmentValue || "0";
      const baseStatus = shipment.paymentReleased ? "completed" : "pending";
      const typeLabel = isBuyer ? "Order Payment" : "Order Settlement";
      entries.push({
        type: typeLabel,
        date: formatWalletTimestamp(timestamp),
        amount: formatWalletAmount(amountWei, direction === "out"),
        status: baseStatus,
        direction,
        reference: trackingId,
        timestamp
      });
    } catch (error) {
      console.warn("Unable to load shipment for wallet history:", error.message || error);
    }
  }
  entries.sort((a, b) => b.timestamp - a.timestamp);
  return entries.slice(0, limit);
}

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
      timestamp: Number(record.timestamp || 0),
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

    const paymentHistory = await loadPaymentHistory(primaryAddress);

    const totalsUsd = ethBalance * ETH_USD_RATE;
    const tokenUsdValue = tokenBalance * ETH_USD_RATE;

    const mergedTransactions = [...paymentHistory, ...transactions];
    mergedTransactions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

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
      transactions: mergedTransactions
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

  return res.redirect('/wallet');
});

app.get('/wallet', requireLogin, requireUser, async (req, res) => {
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
    await ensureContractInstance();
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
    const notaryContract = await getNotaryContract();
    const orders = await Promise.all(
      ids.map(async (trackingId) => {
        const shipmentData = await contractInstance.methods.getShipment(trackingId).call();
        const status = await contractInstance.methods.getShipmentStatus(trackingId).call();
        let orderMeta = null;
        try {
          orderMeta = await contractInstance.methods.getOrderMeta(trackingId).call();
        } catch (error) {
          orderMeta = null;
        }
        let invoice = null;
        if (notaryContract) {
          try {
            invoice = await notaryContract.methods.getInvoice(trackingId).call();
          } catch (error) {
            invoice = null;
          }
        }
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
          lastUpdateTime: new Date(parseInt(status[1], 10) * 1000).toISOString(),
          paymentTxHash: orderMeta && orderMeta[0] && !isZeroBytes32(orderMeta[0]) ? orderMeta[0] : "",
          orderTotalWei: orderMeta && orderMeta[1] ? toJsonSafe(orderMeta[1]) : "0",
          invoice: invoice
            ? {
                buyer: invoice.buyer || "",
                invoiceHash: invoice.invoiceHash || "",
                status: Number(invoice.status || 0),
                timestamp: toJsonSafe(invoice.timestamp || "0")
              }
            : null
        };
      })
    );

    return res.json(toDeepJsonSafe({ success: true, orders }));
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
    await ensureContractInstance();
    if (!contractInstance || !web3Instance) {
      return res.status(400).json({
        success: false,
        message: 'Web3 not connected'
      });
    }

    const buyerAccount = String(
      req.query.account ||
      req.session?.web3Account ||
      account ||
      ""
    ).trim();
    if (!buyerAccount || !buyerAccount.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({
        success: false,
        message: 'No MetaMask account connected'
      });
    }

    const ids = await contractInstance.methods.getBuyerShipments(buyerAccount).call();
    if (!ids || !ids.length) {
      return res.json({ success: true, orders: [] });
    }

    const statusLabels = ["Pending", "Picked Up", "In Transit", "Out For Delivery", "Delivered", "Failed"];
    const notaryContract = await getNotaryContract();
    const orders = await Promise.all(
      ids.map(async (trackingId) => {
        const shipmentData = await contractInstance.methods.getShipment(trackingId).call();
        const status = await contractInstance.methods.getShipmentStatus(trackingId).call();
        let orderMeta = null;
        try {
          orderMeta = await contractInstance.methods.getOrderMeta(trackingId).call();
        } catch (error) {
          orderMeta = null;
        }
        let invoice = null;
        if (notaryContract) {
          try {
            invoice = await notaryContract.methods.getInvoice(trackingId).call();
          } catch (error) {
            invoice = null;
          }
        }
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
          lastUpdateTime: new Date(parseInt(status[1], 10) * 1000).toISOString(),
          paymentTxHash: orderMeta && orderMeta[0] && !isZeroBytes32(orderMeta[0]) ? orderMeta[0] : "",
          orderTotalWei: orderMeta && orderMeta[1] ? toJsonSafe(orderMeta[1]) : "0",
          invoice: invoice
            ? {
                buyer: invoice.buyer || "",
                invoiceHash: invoice.invoiceHash || "",
                status: Number(invoice.status || 0),
                timestamp: toJsonSafe(invoice.timestamp || "0")
              }
            : null
        };
      })
    );

    return res.json(toDeepJsonSafe({ success: true, orders }));
  } catch (error) {
    console.error('Error loading user orders:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unable to load orders'
    });
  }
});

app.get('/api/orders/:trackingId', requireLogin, async (req, res) => {
  try {
    const trackingId = String(req.params.trackingId || "");
    if (!trackingId) {
      return res.status(400).json({
        success: false,
        message: 'TrackingId required'
      });
    }
    await ensureContractInstance();
    if (!contractInstance || !web3Instance) {
      return res.status(400).json({
        success: false,
        message: 'Web3 not connected'
      });
    }
    const productContract = await getProductContract();
    const shipmentData = await contractInstance.methods.getShipment(trackingId).call();
    let orderItems = [];
    try {
      const detailed = await contractInstance.methods.getOrderItemDetails(trackingId).call();
      if (Array.isArray(detailed) && detailed.length) {
        orderItems = detailed.map((item) => ({
          productId: item.productId,
          quantity: Number(item.quantity || 0),
          name: item.name || "",
          priceWei: item.priceWei || "0",
          imageUrl: item.imageUrl || ""
        }));
      }
    } catch (error) {
      orderItems = [];
    }

    if (!orderItems.length) {
      try {
        const orderItemData = await contractInstance.methods.getOrderItems(trackingId).call();
        const productIds = orderItemData && orderItemData[0] ? orderItemData[0] : [];
        const quantities = orderItemData && orderItemData[1] ? orderItemData[1] : [];
        if (productContract) {
          orderItems = await Promise.all(
            productIds.map(async (productId, index) => {
              const qty = Number(quantities[index] || 0);
              const product = await productContract.methods.getProduct(productId).call();
              return {
                productId,
                quantity: qty,
                name: product.name || "",
                priceWei: product.priceWei || "0",
                imageUrl: product.imageUrl || ""
              };
            })
          );
        } else {
          orderItems = productIds.map((productId, index) => ({
            productId,
            quantity: Number(quantities[index] || 0),
            name: "",
            priceWei: "0",
            imageUrl: ""
          }));
        }
      } catch (error) {
        orderItems = [];
      }
    }

    let orderMeta = null;
    try {
      orderMeta = await contractInstance.methods.getOrderMeta(trackingId).call();
    } catch (error) {
      orderMeta = null;
    }

    return res.json(toDeepJsonSafe({
      success: true,
      trackingId,
      shipment: shipmentData,
      orderItems,
      paymentTxHash: orderMeta && orderMeta[0] && !isZeroBytes32(orderMeta[0]) ? orderMeta[0] : "",
      orderTotalWei: orderMeta && orderMeta[1] ? toJsonSafe(orderMeta[1]) : "0"
    }));
  } catch (error) {
    console.error('Error loading order details:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unable to load order'
    });
  }
});

app.post('/api/orders/tx/payment', requireLogin, express.json(), async (req, res) => {
  try {
    const { trackingId, paymentTxHash, account: from } = req.body || {};
    if (!trackingId || !paymentTxHash) {
      return res.status(400).json({
        success: false,
        message: 'Missing trackingId or paymentTxHash'
      });
    }
    if (!contractInstance) {
      return res.status(400).json({
        success: false,
        message: 'Web3 not connected'
      });
    }
    if (!from || !from.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Missing or invalid account'
      });
    }
    const hashValue = String(paymentTxHash).startsWith("0x")
      ? String(paymentTxHash)
      : `0x${String(paymentTxHash)}`;
    const tx = contractInstance.methods.recordPaymentTransaction(trackingId, hashValue);
    const gasEstimate = await tx.estimateGas({ from });
    const gasPrice = await getPreferredGasPrice();

    return res.json({
      success: true,
      txData: {
        from,
        to: contractInstance.options.address,
        data: tx.encodeABI(),
        gas: toHexQuantity(gasEstimate),
        ...(gasPrice && !isZeroQuantity(gasPrice) ? { gasPrice: toHexQuantity(gasPrice) } : {})
      }
    });
  } catch (error) {
    console.error('Error preparing payment tx record:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unable to prepare transaction'
    });
  }
});

app.get('/api/cart', requireLogin, requireUser, (req, res) => {
  try {
    const snapshot = buildSessionCartSnapshot(req);
    return res.json({
      success: true,
      items: snapshot.items,
      totalEth: snapshot.totalEth
    });
  } catch (error) {
    console.error('Error loading cart:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unable to load cart'
    });
  }
});

app.post('/api/cart/add', requireLogin, requireUser, express.json(), async (req, res) => {
  try {
    const { productId, quantity } = req.body || {};
    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID required'
      });
    }
    const qty = Number(quantity || 1);
    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be greater than 0'
      });
    }
    const liveProducts = await getProductsForView();
    const product = liveProducts.find((item) => item.id === productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    const cart = ensureSessionCart(req);
    const existing = cart[productId];
    const copy = JSON.parse(JSON.stringify(product));
    cart[productId] = {
      quantity: (existing ? existing.quantity : 0) + qty,
      product: copy
    };
    const snapshot = buildSessionCartSnapshot(req);
    return res.json({
      success: true,
      cart: snapshot
    });
  } catch (error) {
    console.error('Error adding item to cart:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unable to add to cart'
    });
  }
});

app.post('/api/cart/update', requireLogin, requireUser, express.json(), (req, res) => {
  try {
    const { productId, quantity } = req.body || {};
    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID required'
      });
    }
    const qty = Number(quantity || 0);
    if (!Number.isFinite(qty) || qty < 0) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be 0 or higher'
      });
    }
    const cart = ensureSessionCart(req);
    if (!cart[productId]) {
      return res.status(404).json({
        success: false,
        message: 'Product not in cart'
      });
    }
    if (qty === 0) {
      delete cart[productId];
    } else {
      cart[productId].quantity = qty;
    }
    return res.json({
      success: true,
      cart: buildSessionCartSnapshot(req)
    });
  } catch (error) {
    console.error('Error updating cart item:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unable to update cart'
    });
  }
});

app.post('/api/cart/remove', requireLogin, requireUser, express.json(), (req, res) => {
  try {
    const { productId } = req.body || {};
    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID required'
      });
    }
    const cart = ensureSessionCart(req);
    delete cart[productId];
    return res.json({
      success: true,
      cart: buildSessionCartSnapshot(req)
    });
  } catch (error) {
    console.error('Error removing cart item:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unable to remove item'
    });
  }
});

app.post('/api/cart/clear', requireLogin, requireUser, (req, res) => {
  try {
    clearSessionCart(req);
    return res.json({ success: true });
  } catch (error) {
    console.error('Error clearing cart:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unable to clear cart'
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

app.get('/documents', requireLogin, requireUser, (req, res) => {
  res.render('documents', { acct: account });
});

app.get('/documents/verified', requireLogin, requireUser, (req, res) => {
  const status = String(req.query.status || "").toLowerCase();
  const trackingId = String(req.query.trackingId || "");
  const isSuccess = status === "approved";
  res.render('invoice-status', {
    acct: account,
    trackingId,
    status: isSuccess ? "approved" : "rejected"
  });
});

app.get('/orders', requireLogin, requireUser, (req, res) => {
  res.render('orders', { acct: account });
});

app.get('/review/:trackingId', requireLogin, requireUser, async (req, res) => {
  const trackingId = String(req.params.trackingId || "").trim();
  if (!trackingId) {
    return res.redirect('/orders');
  }
  try {
    await ensureContractInstance();
    if (!contractInstance || !web3Instance) {
      throw new Error('Web3 not connected');
    }
    const statusLabels = ["Pending", "Picked Up", "In Transit", "Out For Delivery", "Delivered", "Failed"];
    const shipmentData = await contractInstance.methods.getShipment(trackingId).call();
    const status = await contractInstance.methods.getShipmentStatus(trackingId).call();
    const statusCode = Number(status[0]);
    const statusLabel = statusLabels[statusCode] || "Pending";
    const delivered = statusCode >= 4;

    const rawOrderItems = await loadOrderItemsForTracking(trackingId);
    const orderItems = rawOrderItems.map((item) => ({
      ...item,
      priceEth: web3Instance.utils.fromWei(String(item.priceWei || "0"), 'ether')
    }));
    const primaryProduct = orderItems[0] || null;
    const reviewSummary = await loadReviewStats(primaryProduct ? primaryProduct.productId : "");

    const sellerTarget = (shipmentData && shipmentData.seller) ? shipmentData.seller : sellerAddress;
    const sellerReputation = await fetchSellerReputation(sellerTarget);

    return res.render('review', {
      acct: account,
      trackingId,
      statusLabel,
      statusCode,
      delivered,
      orderItems,
      primaryProduct,
      reviewSummary,
      averageRating: reviewSummary.averageRating || 0,
      reviewCount: reviewSummary.reviewCount,
      sellerReputation,
      sellerAddress: sellerTarget,
      shipmentData,
      errorMessage: null
    });
  } catch (error) {
    console.error('Error loading review page:', error);
    const fallbackSummary = {
      reviews: [],
      ratingCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      averageRating: 0,
      reviewCount: 0
    };
    return res.status(500).render('review', {
      acct: account,
      trackingId,
      statusLabel: "Unavailable",
      statusCode: 0,
      delivered: false,
      orderItems: [],
      primaryProduct: null,
      reviewSummary: fallbackSummary,
      averageRating: 0,
      reviewCount: 0,
      sellerReputation: null,
      sellerAddress: "",
      shipmentData: null,
      errorMessage: error.message || "Unable to load review data"
    });
  }
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
  const reviewSummary = await loadReviewStats(product.id);
  const ratingCounts = reviewSummary.ratingCounts || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const ratingDistribution = reviewSummary.ratingDistribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const averageRating = reviewSummary.averageRating || product.rating || 0;

  const repTarget = product.sellerAddress || sellerAddress;
  const sellerReputation = await fetchSellerReputation(repTarget);
  if (sellerReputation && product.seller) {
    product.seller.rating = sellerReputation.percent ? Math.round((sellerReputation.percent / 20) * 10) / 10 : product.seller.rating;
    product.seller.sales = sellerReputation.totalSales || product.seller.sales;
    product.seller.verified = sellerReputation.verified;
  }

  res.render('product', {
    acct: account,
    product,
    reviews: reviewSummary.reviews,
    ratingCounts,
    ratingDistribution,
    returnTo: req.originalUrl,
    averageRating,
    reviewCount: reviewSummary.reviewCount,
    sellerReputation
  });
});

app.post('/api/products/tx/create', requireAdmin, express.json(), async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      imageUrl,
      category,
      account: from,
      sellerName,
      stock,
      fullDescription,
      features,
      specifications
    } = req.body;
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

    const featureList = parseList(features);
    const specList = parseSpecs(specifications);
    const specLabels = specList.map((spec) => spec.label);
    const specValues = specList.map((spec) => spec.value);
    const stockValue = Number(stock || 0);
    const statusValue = Number.isFinite(stockValue)
      ? (stockValue === 0 ? 2 : stockValue <= 5 ? 1 : 0)
      : 0;

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
    const resolvedSellerName = sellerName || "TrustedLedger Store";
    const resolvedFullDescription = fullDescription || description;
    const tx = contract.methods.addProduct(
      productId,
      name,
      description,
      cleanImage,
      cleanCategory,
      priceWei,
      from,
      resolvedSellerName,
      Number.isFinite(stockValue) ? stockValue : 0,
      statusValue,
      resolvedFullDescription,
      featureList.length ? featureList : ["Blockchain verified authenticity", "Secure escrow-ready checkout"],
      specLabels.length ? specLabels : ["Condition", "Warranty"],
      specValues.length ? specValues : ["New", "1 Year"]
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

app.post('/cart/add', requireLogin, requireUser, (req, res) => {
  return res.status(400).send('Use the on-chain cart flow with MetaMask.');
});

app.get('/cart', requireLogin, requireUser, (req, res) => {
  res.render('cart', {
    acct: account,
    cartItems: [],
    totalEth: "0.0000"
  });
});

app.get('/checkout', requireLogin, requireUser, (req, res) => {
  res.render('checkout', {
    acct: account,
    cartItems: [],
    totalEth: "0.0000",
    userEmail: req.session && req.session.user ? req.session.user.email : null
  });
});

app.post('/cart/remove', requireLogin, requireUser, (req, res) => {
  return res.status(400).send('Use the on-chain cart flow with MetaMask.');
});

app.post('/cart/clear', requireLogin, requireUser, (req, res) => {
  return res.status(400).send('Use the on-chain cart flow with MetaMask.');
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
    if (req.session) {
      req.session.web3Account = acct;
    }
    
    // Initialize Web3 if not already done
    // For MetaMask: use window.ethereum provider from frontend, or fall back to http provider
    const resolvedProviderUrl = providerUrl || ganacheProviderUrl || WEB3_PROVIDER_URL || 'http://localhost:8545';
    web3Instance = new Web3(resolvedProviderUrl);
    await assertGanacheNetwork(web3Instance);
    
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
      useCartTotal,
      productIds,
      quantities,
      productNames,
      productImages,
      productPrices,
      account: fromAccount
    } = req.body;
    
    if (!contractInstance) {
      return res.status(400).json({
        success: false,
        message: 'Web3 not connected'
      });
    }

    const from = fromAccount || account;
    if (!from || !from.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Missing or invalid buyer account'
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
    let resolvedProductIds = Array.isArray(productIds) ? productIds : [];
    let resolvedQuantities = Array.isArray(quantities) ? quantities : [];
    let resolvedNames = Array.isArray(productNames) ? productNames : [];
    let resolvedImages = Array.isArray(productImages) ? productImages : [];
    let resolvedPrices = Array.isArray(productPrices) ? productPrices : [];
    if (useCartTotal) {
      const snapshot = buildSessionCartSnapshot(req);
      if (!snapshot.items || snapshot.items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Cart is empty'
        });
      }
      resolvedShipmentValue = snapshot.totalEth;
      resolvedProductIds = snapshot.items.map((item) => item.product.id);
      resolvedQuantities = snapshot.items.map((item) => Number(item.quantity || 0));
      resolvedNames = snapshot.items.map((item) => item.product.productInfo.name || "");
      resolvedImages = snapshot.items.map((item) => {
        const images = item.product.images || [];
        return images.length ? images[0] : "";
      });
      resolvedPrices = snapshot.items.map((item) => {
        const priceEth = Number(item.product.productInfo.price || 0);
        return Number.isFinite(priceEth)
          ? web3Instance.utils.toWei(String(priceEth), "ether")
          : "0";
      });
    }

    const normalizeWeiValue = (value) => {
      if (value === null || value === undefined) {
        return "0";
      }
      const str = String(value).trim();
      if (!str) {
        return "0";
      }
      if (str.startsWith("0x")) {
        return str;
      }
      if (str.includes(".")) {
        return web3Instance.utils.toWei(str, "ether");
      }
      if (/^\d+$/.test(str)) {
        return str;
      }
      return "0";
    };

    if (resolvedPrices.length) {
      resolvedPrices = resolvedPrices.map((value) => normalizeWeiValue(value));
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

    let tx;
    if (resolvedProductIds.length
      && resolvedProductIds.length === resolvedQuantities.length
      && resolvedProductIds.length === resolvedNames.length
      && resolvedProductIds.length === resolvedImages.length
      && resolvedProductIds.length === resolvedPrices.length) {
      tx = contractInstance.methods.createShipmentWithItemDetails(
        trackingId,
        senderName,
        senderAddress,
        safeRecipientName,
        safeRecipientAddress,
        itemDescription,
        web3Instance.utils.toWei(String(resolvedShipmentValue), 'ether'),
        resolvedProductIds,
        resolvedQuantities,
        resolvedNames,
        resolvedImages,
        resolvedPrices
      );
    } else {
      tx = contractInstance.methods.createShipment(
        trackingId,
        senderName,
        senderAddress,
        safeRecipientName,
        safeRecipientAddress,
        itemDescription,
        web3Instance.utils.toWei(String(resolvedShipmentValue), 'ether')
      );
    }
    
    // Prepare transaction for MetaMask
    const value = web3Instance.utils.toWei(String(resolvedShipmentValue), 'ether');
    const gasEstimate = await tx.estimateGas({ from: from, value: value });
    const gasPrice = await getPreferredGasPrice();
    
    const txData = {
      from: from,
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

app.get('/api/contracts/admin', async (req, res) => {
  try {
    await ensureContractInstance();
    if (!contractInstance || !web3Instance) {
      return res.status(400).json({
        success: false,
        message: 'Web3 not connected'
      });
    }
    const admin = await contractInstance.methods.admin().call();
    return res.json({ success: true, admin });
  } catch (error) {
    console.error('Error loading contract admin:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unable to read admin address'
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

app.post('/api/reviews/reply/tx', requireAdmin, express.json(), async (req, res) => {
  try {
    const { reviewId, reply, account: from } = req.body || {};
    if (reviewId === undefined || reviewId === null || reply === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Missing reviewId or reply'
      });
    }

    const reviewContract = await getReviewContract();
    if (!reviewContract) {
      return res.status(500).json({
        success: false,
        message: 'Review contract not available'
      });
    }

    if (!from || !from.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Missing or invalid admin account'
      });
    }

    const tx = reviewContract.methods.replyToReview(Number(reviewId), String(reply));
    const gasEstimate = await tx.estimateGas({ from });
    const gasPrice = await web3Instance.eth.getGasPrice();

    return res.json({
      success: true,
      message: 'Reply transaction prepared',
      txData: {
        from,
        to: reviewContract.options.address,
        data: tx.encodeABI(),
        gas: toHexQuantity(gasEstimate),
        ...(gasPrice && !isZeroQuantity(gasPrice) ? { gasPrice: toHexQuantity(gasPrice) } : {})
      }
    });
  } catch (error) {
    console.error('Error preparing review reply tx:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unable to prepare reply transaction'
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
    const { trackingId, invoiceHash, account: from } = req.body || {};
    if (!trackingId || !invoiceHash) {
      return res.status(400).json({
        success: false,
        message: 'Missing trackingId or invoiceHash'
      });
    }
    if (!from || !from.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Missing or invalid account'
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
    const gasEstimate = await tx.estimateGas({ from });
    const gasPrice = await web3Instance.eth.getGasPrice();

    const txData = {
      from: from,
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
    const { trackingId, authentic, account: from } = req.body || {};
    if (!trackingId || authentic === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Missing trackingId or authentic flag'
      });
    }
    if (!from || !from.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Missing or invalid account'
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
    const gasEstimate = await tx.estimateGas({ from });
    const gasPrice = await web3Instance.eth.getGasPrice();

    const txData = {
      from: from,
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
    let purchaseValid = false;
    if (contractInstance) {
      try {
        const shipment = await contractInstance.methods.getShipment(trackingId).call();
        purchaseValid = shipment && shipment.buyer
          ? String(shipment.buyer).toLowerCase() === String(onChain.buyer || "").toLowerCase()
          : false;
      } catch (error) {
        purchaseValid = false;
      }
    }
    const hashMatches = chainHash && chainHash !== ZERO_BYTES32
      ? chainHash === submittedHash
      : false;
    const authentic = hashMatches && purchaseValid;

    return res.json({
      success: true,
      authentic,
      invoiceHash: submittedHash,
      chainHash,
      status: Number(onChain.status || 0),
      purchaseValid
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


