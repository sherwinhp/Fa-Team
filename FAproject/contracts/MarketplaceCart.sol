// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IProductCatalog {
    function isProductActive(bytes32 productId) external view returns (bool);
}

contract MarketplaceCart {
    IProductCatalog public catalog;

    mapping(address => bytes32[]) private cartProductIds;
    mapping(address => mapping(bytes32 => uint256)) private cartQuantities;
    mapping(address => mapping(bytes32 => uint256)) private cartIndex;

    event CartItemAdded(address indexed buyer, bytes32 indexed productId, uint256 quantity);
    event CartItemRemoved(address indexed buyer, bytes32 indexed productId);
    event CartCleared(address indexed buyer);
    event CartItemUpdated(address indexed buyer, bytes32 indexed productId, uint256 quantity);

    constructor(address catalogAddress) {
        require(catalogAddress != address(0), "Catalog required");
        catalog = IProductCatalog(catalogAddress);
    }

    function addToCart(bytes32 productId, uint256 quantity) external {
        require(productId != bytes32(0), "Invalid product");
        require(quantity > 0, "Quantity required");
        require(catalog.isProductActive(productId), "Product inactive");

        if (cartQuantities[msg.sender][productId] == 0) {
            cartIndex[msg.sender][productId] = cartProductIds[msg.sender].length;
            cartProductIds[msg.sender].push(productId);
        }

        cartQuantities[msg.sender][productId] += quantity;
        emit CartItemAdded(msg.sender, productId, quantity);
    }

    function updateQuantity(bytes32 productId, uint256 quantity) external {
        require(productId != bytes32(0), "Invalid product");
        require(cartQuantities[msg.sender][productId] > 0, "Not in cart");

        if (quantity == 0) {
            _removeFromCart(msg.sender, productId);
            emit CartItemRemoved(msg.sender, productId);
            return;
        }

        cartQuantities[msg.sender][productId] = quantity;
        emit CartItemUpdated(msg.sender, productId, quantity);
    }

    function removeFromCart(bytes32 productId) external {
        require(cartQuantities[msg.sender][productId] > 0, "Not in cart");
        _removeFromCart(msg.sender, productId);
        emit CartItemRemoved(msg.sender, productId);
    }

    function clearCart() external {
        bytes32[] storage ids = cartProductIds[msg.sender];
        for (uint256 i = 0; i < ids.length; i++) {
            delete cartQuantities[msg.sender][ids[i]];
            delete cartIndex[msg.sender][ids[i]];
        }
        delete cartProductIds[msg.sender];
        emit CartCleared(msg.sender);
    }

    function getCart(address buyer) external view returns (bytes32[] memory ids, uint256[] memory quantities) {
        bytes32[] memory storedIds = cartProductIds[buyer];
        uint256[] memory storedQuantities = new uint256[](storedIds.length);
        for (uint256 i = 0; i < storedIds.length; i++) {
            storedQuantities[i] = cartQuantities[buyer][storedIds[i]];
        }
        return (storedIds, storedQuantities);
    }

    function _removeFromCart(address buyer, bytes32 productId) internal {
        bytes32[] storage ids = cartProductIds[buyer];
        uint256 index = cartIndex[buyer][productId];
        uint256 lastIndex = ids.length - 1;
        if (index != lastIndex) {
            bytes32 lastId = ids[lastIndex];
            ids[index] = lastId;
            cartIndex[buyer][lastId] = index;
        }
        ids.pop();
        delete cartIndex[buyer][productId];
        delete cartQuantities[buyer][productId];
    }
}
