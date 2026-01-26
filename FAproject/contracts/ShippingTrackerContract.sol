// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/*
 I declare that this code was written by me. 
 I will not copy or allow others to copy my code. 
 I understand that copying code is considered as plagiarism.
 
 Student Name: Pei Ling
 Student ID: 24045100
 Class: C002 - Team 4
 Date created: December 2025
 */

contract ShippingTrackerContract {

// State user defined data types using ENUM for Delivery Status

	enum DeliveryStatus{ Pending, Picked_Up, In_Transit, Out_For_Delivery, Delivered, Failed }


// State variables declared outside the function inside the contract
// Stored on the blockchain.

    string private welcomeMessage = "Welcome to Blockchain Shipping Tracker"; 
    address public admin;
    address public seller;
    uint256 shipmentCount;
    uint256 escrowBalance;


// Constructor code is only run when the contract is created

    constructor() {
        admin = msg.sender;
        seller = 0x46EB73Cb66991C07622b3aB77a6E9A93139EE661;
        shipmentCount = 0;
        escrowBalance = 0;
    }
    
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can call this function");
        _;
    }

// Define Struct required for Shipping Tracker

    struct TrackingUpdate {
        DeliveryStatus status;
        string location;
        uint256 timestamp;
        string notes;
    }

    struct ShipmentData {
        string trackingId;
        address seller;
        address buyer;
        string senderName;
        string senderAddress;
        string recipientName;
        string recipientAddress;
        string itemDescription;
        uint256 shipmentValue;
        uint256 createdAt;
        bool paymentReleased;
    }

    struct ShipmentTracking {
        ShipmentData shipment;
        TrackingUpdate[] updates;
        DeliveryStatus currentStatus;
        uint256 lastUpdateTime;
    }

    mapping(string => ShipmentTracking) public shipments;
    mapping(address => string[]) public sellerShipments;
    mapping(address => string[]) public buyerShipments;
 

// View does not modify the state variable welcomeMessage
    function getWelcomeMessage() public view returns (string memory) 
    {
        return welcomeMessage;
    }

    function getShipmentCount() public view returns (uint256) {
        return shipmentCount;
    }

    // Create a new shipment and hold payment in escrow
    function createShipment(
        string memory _trackingId,
        string memory _senderName,
        string memory _senderAddress,
        string memory _recipientName,
        string memory _recipientAddress,
        string memory _itemDescription,
        uint256 _shipmentValue
    ) public payable returns (bool) {
        require(msg.value == _shipmentValue, "Payment amount does not match shipment value");
        require(msg.sender != address(0), "Invalid buyer address");
        require(seller != address(0), "Seller not configured");
        require(bytes(_trackingId).length > 0, "Tracking ID cannot be empty");
        
        // Check if tracking ID already exists
        require(bytes(shipments[_trackingId].shipment.trackingId).length == 0, "Tracking ID already exists");
        
        // Create shipment
        ShipmentData memory newShipment = ShipmentData(
            _trackingId,
            seller,
            msg.sender,
            _senderName,
            _senderAddress,
            _recipientName,
            _recipientAddress,
            _itemDescription,
            _shipmentValue,
            block.timestamp,
            false
        );
        
        shipments[_trackingId].shipment = newShipment;
        shipments[_trackingId].currentStatus = DeliveryStatus.Pending;
        shipments[_trackingId].lastUpdateTime = block.timestamp;
        
        // Add initial tracking update
        shipments[_trackingId].updates.push(TrackingUpdate(
            DeliveryStatus.Pending,
            _senderAddress,
            block.timestamp,
            "Shipment created and awaiting pickup"
        ));
        
        sellerShipments[seller].push(_trackingId);
        buyerShipments[msg.sender].push(_trackingId);
        
        escrowBalance += _shipmentValue;
        shipmentCount++;
        
        return true;
    }
    
    // Add tracking update with timestamp
    function updateShipmentStatus(
        string memory _trackingId,
        DeliveryStatus _newStatus,
        string memory _location,
        string memory _notes
    ) public onlyAdmin returns (bool) {
        require(bytes(shipments[_trackingId].shipment.trackingId).length != 0, "Shipment not found");
        require(!shipments[_trackingId].shipment.paymentReleased, "Shipment already delivered and paid");
        
        shipments[_trackingId].currentStatus = _newStatus;
        shipments[_trackingId].lastUpdateTime = block.timestamp;
        
        // Add tracking update with timestamp
        shipments[_trackingId].updates.push(TrackingUpdate(
            _newStatus,
            _location,
            block.timestamp,
            _notes
        ));
        
        return true;
    }
    
    // Release payment when delivery is confirmed
    function confirmDeliveryAndReleasePayment(string memory _trackingId) public onlyAdmin returns (bool) {
        require(bytes(shipments[_trackingId].shipment.trackingId).length != 0, "Shipment not found");
        require(!shipments[_trackingId].shipment.paymentReleased, "Payment already released");
        require(shipments[_trackingId].currentStatus == DeliveryStatus.Delivered, "Shipment not yet delivered");
        
        // Mark shipment as paid
        shipments[_trackingId].shipment.paymentReleased = true;
        
        // Transfer payment to seller
        uint256 amount = shipments[_trackingId].shipment.shipmentValue;
        escrowBalance -= amount;
        
        (bool success, ) = payable(shipments[_trackingId].shipment.seller).call{value: amount}("");
        require(success, "Payment transfer failed");
        
        // Add final tracking update
        shipments[_trackingId].updates.push(TrackingUpdate(
            DeliveryStatus.Delivered,
            shipments[_trackingId].shipment.recipientAddress,
            block.timestamp,
            "Delivery confirmed. Payment released to seller."
        ));
        
        return true;
    }
    
    // Get shipment details
    function getShipment(string memory _trackingId) public view returns (ShipmentData memory) {
        require(bytes(shipments[_trackingId].shipment.trackingId).length != 0, "Shipment not found");
        return shipments[_trackingId].shipment;
    }
    
    // Get all tracking updates for a shipment with timestamps
    function getShipmentUpdates(string memory _trackingId) public view returns (TrackingUpdate[] memory) {
        require(bytes(shipments[_trackingId].shipment.trackingId).length != 0, "Shipment not found");
        return shipments[_trackingId].updates;
    }
    
    // Get current shipment status with last update time
    function getShipmentStatus(string memory _trackingId) public view returns (DeliveryStatus, uint256) {
        require(bytes(shipments[_trackingId].shipment.trackingId).length != 0, "Shipment not found");
        return (shipments[_trackingId].currentStatus, shipments[_trackingId].lastUpdateTime);
    }
    
    // Get seller shipments
    function getSellerShipments(address _seller) public view returns (string[] memory) {
        return sellerShipments[_seller];
    }
    
    // Get buyer shipments
    function getBuyerShipments(address _buyer) public view returns (string[] memory) {
        return buyerShipments[_buyer];
    }
    
    // Get escrow balance
    function getEscrowBalance() public view returns (uint256) {
        return escrowBalance;
    }
}

