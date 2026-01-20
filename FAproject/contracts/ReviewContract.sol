// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title ReviewContract
 * @notice Stores product reviews on-chain and links them to purchase proofs.
 */
contract ReviewContract {
    struct Review {
        uint256 productId;
        address buyer;
        uint8 rating;
        string commentHash;
        uint256 timestamp;
        bytes32 purchaseId;
        bytes32 deliveryTxHash;
    }

    Review[] private reviews;
    mapping(uint256 => uint256[]) private productReviews;
    mapping(bytes32 => bool) private reviewedPurchase; // purchaseId => bool

    event ReviewSubmitted(
        uint256 indexed productId,
        address indexed buyer,
        uint8 rating,
        bytes32 indexed purchaseId,
        bytes32 deliveryTxHash
    );

    function submitReview(
        uint256 productId,
        bytes32 purchaseId,
        uint8 rating,
        string calldata commentHash,
        bytes32 deliveryTxHash
    ) external {
        require(productId > 0, "Invalid product");
        require(purchaseId != bytes32(0), "PurchaseId required");
        require(!reviewedPurchase[purchaseId], "Purchase already reviewed");
        require(rating >= 1 && rating <= 5, "Rating 1-5");

        reviews.push(
            Review({
                productId: productId,
                buyer: msg.sender,
                rating: rating,
                commentHash: commentHash,
                timestamp: block.timestamp,
                purchaseId: purchaseId,
                deliveryTxHash: deliveryTxHash
            })
        );
        uint256 idx = reviews.length - 1;
        productReviews[productId].push(idx);
        reviewedPurchase[purchaseId] = true;

        emit ReviewSubmitted(productId, msg.sender, rating, purchaseId, deliveryTxHash);
    }

    function getReviews(uint256 productId) external view returns (Review[] memory) {
        uint256[] memory ids = productReviews[productId];
        Review[] memory result = new Review[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            result[i] = reviews[ids[i]];
        }
        return result;
    }

    function getAverageRating(uint256 productId) external view returns (uint256 average, uint256 count) {
        uint256[] memory ids = productReviews[productId];
        if (ids.length == 0) {
            return (0, 0);
        }
        uint256 total;
        for (uint256 i = 0; i < ids.length; i++) {
            total += reviews[ids[i]].rating;
        }
        return ((total * 100) / (ids.length * 5), ids.length);
    }

    function hasReviewed(bytes32 purchaseId) external view returns (bool) {
        return reviewedPurchase[purchaseId];
    }
}
