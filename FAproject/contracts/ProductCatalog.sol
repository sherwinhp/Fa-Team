// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract ProductCatalog {
    address public admin;

    enum StockStatus {
        InStock,
        Limited,
        OutOfStock
    }

    struct Product {
        string name;
        string description;
        string imageUrl;
        string category;
        uint256 priceWei;
        bool active;
        address seller;
        string sellerName;
        uint256 stock;
        StockStatus status;
        string fullDescription;
        uint256 createdAt;
        uint256 updatedAt;
    }

    mapping(bytes32 => Product) private products;
    mapping(bytes32 => string[]) private productFeatures;
    mapping(bytes32 => string[]) private productSpecLabels;
    mapping(bytes32 => string[]) private productSpecValues;
    mapping(bytes32 => uint256) private productIndex;
    bytes32[] private productIds;

    event ProductAdded(bytes32 indexed productId, string name, uint256 priceWei);
    event ProductRemoved(bytes32 indexed productId);
    event ProductUpdated(bytes32 indexed productId);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function addProduct(
        bytes32 productId,
        string memory name,
        string memory description,
        string memory imageUrl,
        string memory category,
        uint256 priceWei,
        address seller,
        string memory sellerName,
        uint256 stock,
        StockStatus status,
        string memory fullDescription,
        string[] memory features,
        string[] memory specLabels,
        string[] memory specValues
    ) external onlyAdmin {
        require(productId != bytes32(0), "Invalid product id");
        require(bytes(name).length > 0, "Name required");
        require(priceWei > 0, "Price required");
        require(!products[productId].active, "Product exists");
        require(specLabels.length == specValues.length, "Spec mismatch");

        Product storage product = products[productId];
        product.name = name;
        product.description = description;
        product.imageUrl = imageUrl;
        product.category = category;
        product.priceWei = priceWei;
        product.active = true;
        product.seller = seller;
        product.sellerName = sellerName;
        product.stock = stock;
        product.status = status;
        product.fullDescription = fullDescription;
        product.createdAt = block.timestamp;
        product.updatedAt = block.timestamp;

        productFeatures[productId] = features;
        productSpecLabels[productId] = specLabels;
        productSpecValues[productId] = specValues;

        productIndex[productId] = productIds.length;
        productIds.push(productId);

        emit ProductAdded(productId, name, priceWei);
    }

    function updateProductStock(
        bytes32 productId,
        uint256 stock,
        StockStatus status
    ) external onlyAdmin {
        require(products[productId].active, "Product not found");
        products[productId].stock = stock;
        products[productId].status = status;
        products[productId].updatedAt = block.timestamp;
        emit ProductUpdated(productId);
    }

    function removeProduct(bytes32 productId) external onlyAdmin {
        require(products[productId].active, "Product not found");

        uint256 index = productIndex[productId];
        uint256 lastIndex = productIds.length - 1;

        if (index != lastIndex) {
            bytes32 lastId = productIds[lastIndex];
            productIds[index] = lastId;
            productIndex[lastId] = index;
        }

        productIds.pop();
        delete productIndex[productId];
        delete products[productId];
        delete productFeatures[productId];
        delete productSpecLabels[productId];
        delete productSpecValues[productId];

        emit ProductRemoved(productId);
    }

    function getProduct(bytes32 productId) external view returns (Product memory) {
        return products[productId];
    }

    function getProductFeatures(bytes32 productId) external view returns (string[] memory) {
        return productFeatures[productId];
    }

    function getProductSpecifications(bytes32 productId)
        external
        view
        returns (string[] memory labels, string[] memory values)
    {
        return (productSpecLabels[productId], productSpecValues[productId]);
    }

    function isProductActive(bytes32 productId) external view returns (bool) {
        return products[productId].active;
    }

    function getProductIds() external view returns (bytes32[] memory) {
        return productIds;
    }

    function getProductCount() external view returns (uint256) {
        return productIds.length;
    }
}
