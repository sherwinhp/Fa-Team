// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title ReviewContract
 * @notice Stores product reviews on-chain and links them to purchase proofs.
 */
contract ReviewContract {
    struct Review {
        bytes32 productId;
        address buyer;
        uint8 rating;
        string commentHash;
        string photoHash;
        uint256 timestamp;
        bytes32 purchaseId;
        bytes32 deliveryTxHash;
    }

    Review[] private reviews;
    mapping(bytes32 => uint256[]) private productReviews;
    mapping(bytes32 => bool) private reviewedPurchase; // purchaseId => bool

    event ReviewSubmitted(
        bytes32 indexed productId,
        address indexed buyer,
        uint8 rating,
        bytes32 indexed purchaseId,
        bytes32 deliveryTxHash
    );

    function submitReview(
        bytes32 productId,
        bytes32 purchaseId,
        uint8 rating,
        string calldata commentHash,
        string calldata photoHash,
        bytes32 deliveryTxHash
    ) external {
        require(productId != bytes32(0), "Invalid product");
        require(purchaseId != bytes32(0), "PurchaseId required");
        require(!reviewedPurchase[purchaseId], "Purchase already reviewed");
        require(rating <= 5, "Rating 0-5");

        reviews.push(
            Review({
                productId: productId,
                buyer: msg.sender,
                rating: rating,
                commentHash: commentHash,
                photoHash: photoHash,
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

    function getReviews(bytes32 productId) external view returns (Review[] memory) {
        uint256[] memory ids = productReviews[productId];
        Review[] memory result = new Review[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            result[i] = reviews[ids[i]];
        }
        return result;
    }

    function getAverageRating(bytes32 productId) external view returns (uint256 average, uint256 count) {
        uint256[] memory ids = productReviews[productId];
        if (ids.length == 0) {
            return (0, 0);
        }
        uint256 total;
        uint256 ratedCount;
        for (uint256 i = 0; i < ids.length; i++) {
            uint8 ratingValue = reviews[ids[i]].rating;
            if (ratingValue == 0) {
                continue;
            }
            total += ratingValue;
            ratedCount += 1;
        }
        if (ratedCount == 0) {
            return (0, 0);
        }
        return ((total * 100) / (ratedCount * 5), ratedCount);
    }

    function hasReviewed(bytes32 purchaseId) external view returns (bool) {
        return reviewedPurchase[purchaseId];
    }
}
