const express = require('express');
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

//start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
// declare the global variables
let account = '';
let shipmentCount = 0;
let loading = true;  
let web3Instance = null;
let contractInstance = null;   
 
// Define routes - home page
app.get('/', async(req, res) => {   
    console.log("Shipping Tracker Home Page");
    try {
      res.render('index', {
        acct: account,
        cnt: shipmentCount,
        shipments: [],
        products: [],
        status: loading
      });
    } catch (error) {
        console.error('Error in home route:', error);
        res.status(500).send('Server error');
    }
});

app.get('/about', (req, res) => {
  res.render('about', { acct: account });
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


