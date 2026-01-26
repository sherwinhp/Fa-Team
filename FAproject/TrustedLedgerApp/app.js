require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const {Web3} = require('web3');
const fs = require("fs");

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

const WEB3_PROVIDER_URL = process.env.WEB3_PROVIDER_URL || 'http://127.0.0.1:8545';
const ETH_USD_RATE = Number(process.env.ETH_USD_RATE) || 1850;
const WALLET_TOKEN_SYMBOL = process.env.WALLET_TOKEN_SYMBOL || 'ETHR';
const WALLET_TOKEN_NAME = process.env.WALLET_TOKEN_NAME || 'Ethereum';
const WALLET_TOKEN_STANDARD = process.env.WALLET_TOKEN_STANDARD || 'ERC-20 Standard Token';
const WALLET_CONTRACT_ADDRESS = process.env.WALLET_CONTRACT_ADDRESS || '';
const WALLET_TOTAL_SUPPLY = process.env.WALLET_TOTAL_SUPPLY || '1,000,000 ETHR';

app.use((req, res, next) => {
  res.locals.isLoggedIn = Boolean(req.session && req.session.user);
  res.locals.userRole = req.session && req.session.user ? req.session.user.role : null;
  res.locals.userEmail = req.session && req.session.user ? req.session.user.email : null;
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

const walletArtifactPath = path.join(__dirname, 'public', 'build', 'WalletContract.json');
let walletContractAbi = null;
try {
  walletContractAbi = JSON.parse(fs.readFileSync(walletArtifactPath, 'utf8')).abi;
} catch (error) {
  console.warn("Wallet contract ABI not available:", error.message || error);
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

let products = [...mockProducts];

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

async function buildWalletSnapshot() {
  if (!web3Instance) {
    return buildEmptyWalletSnapshot();
  }

  try {
    const accounts = await web3Instance.eth.getAccounts();
    const primaryAddress = accounts[0] || "";
    const balanceWei = primaryAddress ? await web3Instance.eth.getBalance(primaryAddress) : "0";
    const ethBalance = parseFloat(web3Instance.utils.fromWei(balanceWei || "0", "ether")) || 0;
    let tokenBalance = ethBalance;

    if (primaryAddress && WALLET_CONTRACT_ADDRESS) {
      const walletContract = resolveWalletContract();
      if (walletContract) {
        const ledgerBalance = await walletContract.methods.balanceOf(primaryAddress).call();
        tokenBalance = parseFloat(web3Instance.utils.fromWei(ledgerBalance || "0", "ether")) || tokenBalance;
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
      transactions: []
    };

    if (primaryAddress && !account) {
      account = primaryAddress;
    }

    return snapshot;
  } catch (error) {
    console.error("Unable to build wallet snapshot:", error);
    return buildEmptyWalletSnapshot();
  }
}
 
// Define routes - home page
app.get('/', async(req, res) => {   
    console.log("Shipping Tracker Home Page");
    try {
      res.render('index', {
        acct: account,
        cnt: shipmentCount,
        shipments: [],
        products: products,
        status: loading,
        addObject: null,
        addFunction: null,
        addStatus: false
      });
    } catch (error) {
        console.error('Error in home route:', error);
        res.status(500).send('Server error');
    }
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

app.get('/wallet', requireLogin, async (req, res) => {
  try {
    const wallet = await buildWalletSnapshot();
    return res.render('wallet', { acct: account, wallet });
  } catch (error) {
    console.error('Error rendering wallet:', error);
    return res.status(500).send('Unable to load wallet data');
  }
});

app.get('/admin', requireAdmin, (req, res) => {
  res.render('admin-dashboard', { acct: account });
});

app.get('/documents', requireLogin, (req, res) => {
  res.render('documents', { acct: account });
});

// Add product page
app.get('/addproduct', (req, res) => {
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

app.post('/addproduct', (req, res) => {
  const { name, description, price } = req.body;

  if (!name || !description || !price) {
    return res.status(400).render('addProduct', {
      acct: account,
      products: products,
      status: loading,
      addObject: null,
      addFunction: null,
      addStatus: false,
      error: 'Please fill in product name, description, and price.',
      formData: req.body
    });
  }

  const newProduct = buildProductFromForm(req.body);
  products.unshift(newProduct);
  return res.redirect('/');
});

app.get('/product/:id', (req, res) => {
  const { id } = req.params;
  const product = products.find((item) => item.id === id) || products[0];
  const ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  mockReviews.forEach((review) => {
    ratingCounts[review.rating] += 1;
  });
  const totalReviews = mockReviews.length || 1;
  const ratingDistribution = {};
  for (let i = 1; i <= 5; i += 1) {
    ratingDistribution[i] = Math.round((ratingCounts[i] / totalReviews) * 100);
  }

  res.render('product', {
    acct: account,
    product,
    reviews: mockReviews,
    ratingCounts,
    ratingDistribution,
    returnTo: req.originalUrl
  });
});

// Shipping tracker page 
app.get("/shipping/tracker", (req, res) => {
  res.render("tracking");
});

// Initialize Web3 connection and contract
app.post('/web3Connect', express.json(), async (req, res) => {
  try {
    const { contractAddress, acct, providerUrl } = req.body;
    console.log("Connecting to Web3...");
    console.log("Contract Address:", contractAddress);
    console.log("Account:", acct);
    
    // Validate inputs
    if (!contractAddress || !acct) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: contractAddress and acct'
      });
    }
    
    // Validate Ethereum address format
    if (!acct.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Ethereum address format'
      });
    }
    
    // Validate contract address format
    if (!contractAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid contract address format'
      });
    }
    
    account = acct;
    
    // Initialize Web3 if not already done
    // For MetaMask: use window.ethereum provider from frontend, or fall back to http provider
    if (!web3Instance) {
      web3Instance = new Web3(providerUrl || 'http://localhost:8545');
    }
    
    // Load contract ABI
    const contractABI = JSON.parse(fs.readFileSync('public/build/ShippingTrackerContract.json', 'utf8')).abi;
    contractInstance = new web3Instance.eth.Contract(contractABI, contractAddress);
    
    // Get shipment count
    const count = await contractInstance.methods.getShipmentCount().call();
    shipmentCount = parseInt(count);
    
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
      buyerAddress,
      senderName,
      senderAddress,
      recipientName,
      recipientAddress,
      itemDescription,
      shipmentValue
    } = req.body;
    
    if (!contractInstance) {
      return res.status(400).json({
        success: false,
        message: 'Web3 not connected'
      });
    }
    
    // Validate inputs
    if (!trackingId || !buyerAddress || !shipmentValue) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: trackingId, buyerAddress, shipmentValue'
      });
    }
    
    // Validate Ethereum addresses
    if (!buyerAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid buyer address format'
      });
    }
    
    // Validate shipment value is positive
    if (parseFloat(shipmentValue) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Shipment value must be greater than 0'
      });
    }
    
    // Call smart contract method
    const tx = contractInstance.methods.createShipment(
      trackingId,
      buyerAddress,
      senderName,
      senderAddress,
      recipientName,
      recipientAddress,
      itemDescription,
      web3Instance.utils.toWei(shipmentValue.toString(), 'ether')
    );
    
    // Prepare transaction for MetaMask
    const value = web3Instance.utils.toWei(shipmentValue.toString(), 'ether');
    const gasEstimate = await tx.estimateGas({ from: account, value: value });
    const gasPrice = await web3Instance.eth.getGasPrice();
    
    const txData = {
      from: account,
      to: contractInstance.options.address,
      data: tx.encodeABI(),
      value: value,
      gas: gasEstimate.toString(),
      gasPrice: gasPrice.toString()
    };
    
    console.log('Shipment creation requested:', trackingId);
    
    res.json({
      success: true,
      message: 'Shipment creation initiated',
      txData: txData,
      trackingId: trackingId,
      estimatedGas: gasEstimate.toString(),
      estimatedGasPrice: gasPrice.toString()
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
      gas: gasEstimate.toString(),
      gasPrice: gasPrice.toString()
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
      gas: gasEstimate,
      gasPrice: gasPrice
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


