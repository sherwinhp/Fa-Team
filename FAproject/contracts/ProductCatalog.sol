// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract ProductCatalog {
    address public admin;

    struct Product {
        string name;
        string description;
        string imageUrl;
        string category;
        uint256 priceWei;
        bool active;
    }

    mapping(bytes32 => Product) private products;
    mapping(bytes32 => uint256) private productIndex;
    bytes32[] private productIds;

    event ProductAdded(bytes32 indexed productId, string name, uint256 priceWei);
    event ProductRemoved(bytes32 indexed productId);

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
        uint256 priceWei
    ) external onlyAdmin {
        require(productId != bytes32(0), "Invalid product id");
        require(bytes(name).length > 0, "Name required");
        require(priceWei > 0, "Price required");
        require(!products[productId].active, "Product exists");

        products[productId] = Product({
            name: name,
            description: description,
            imageUrl: imageUrl,
            category: category,
            priceWei: priceWei,
            active: true
        });

        productIndex[productId] = productIds.length;
        productIds.push(productId);

        emit ProductAdded(productId, name, priceWei);
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

        emit ProductRemoved(productId);
    }

    function getProduct(bytes32 productId) external view returns (Product memory) {
        return products[productId];
    }

    function getProductIds() external view returns (bytes32[] memory) {
        return productIds;
    }

    function getProductCount() external view returns (uint256) {
        return productIds.length;
    }
}
