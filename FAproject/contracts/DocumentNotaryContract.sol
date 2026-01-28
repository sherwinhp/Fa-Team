// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title DocumentNotaryContract
 * @notice Stores invoice hashes and notarization decisions on-chain.
 */
contract DocumentNotaryContract {
    enum NotaryStatus {
        Pending,
        Approved,
        Rejected
    }

    struct InvoiceRecord {
        address buyer;
        bytes32 invoiceHash;
        uint256 timestamp;
        NotaryStatus status;
    }

    address public owner;
    mapping(string => InvoiceRecord) private invoices;

    event InvoiceRegistered(string indexed trackingId, address indexed buyer, bytes32 invoiceHash);
    event InvoiceAttested(string indexed trackingId, NotaryStatus status);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function registerInvoice(string memory trackingId, bytes32 invoiceHash) external {
        require(bytes(trackingId).length > 0, "TrackingId required");
        require(invoiceHash != bytes32(0), "Invoice hash required");
        require(invoices[trackingId].buyer == address(0), "Invoice exists");

        invoices[trackingId] = InvoiceRecord({
            buyer: msg.sender,
            invoiceHash: invoiceHash,
            timestamp: block.timestamp,
            status: NotaryStatus.Pending
        });

        emit InvoiceRegistered(trackingId, msg.sender, invoiceHash);
    }

    function attestInvoice(string memory trackingId, bool authentic) external onlyOwner {
        require(bytes(trackingId).length > 0, "TrackingId required");
        require(invoices[trackingId].buyer != address(0), "Invoice missing");

        invoices[trackingId].status = authentic ? NotaryStatus.Approved : NotaryStatus.Rejected;
        emit InvoiceAttested(trackingId, invoices[trackingId].status);
    }

    function getInvoice(string memory trackingId) external view returns (InvoiceRecord memory) {
        return invoices[trackingId];
    }
}
