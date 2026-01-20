// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title ReputationContract
 * @notice Tracks seller reputation scores with recency weighting and verification.
 */
contract ReputationContract {
    enum WeightBand {
        Recent,
        Month,
        Quarter,
        HalfYear,
        Old
    }

    struct Rating {
        address buyer;
        uint8 overall;
        uint8 quality;
        uint8 shipping;
        uint8 communication;
        uint256 timestamp;
        bytes32 orderId;
    }

    struct SellerSnapshot {
        uint256 weightedScoreSum;
        uint256 weightSum;
        uint256 totalRatings;
        uint256 totalSales;
        bool verified;
    }

    address public owner;
    Rating[] private ratings;
    mapping(address => uint256[]) private sellerRatings;
    mapping(address => mapping(bytes32 => bool)) private ratedOrder; // seller => orderId => bool
    mapping(address => mapping(address => bool)) private ratedBuyerSeller; // seller => buyer => bool
    mapping(address => uint256[5]) private distribution; // index 0 = 1 star, 4 = 5 stars
    mapping(address => SellerSnapshot) private sellers;

    event SellerRated(address indexed seller, address indexed buyer, uint8 score, bytes32 indexed orderId, uint256 weight);
    event SellerVerified(address indexed seller, bool verified);
    event SalesUpdated(address indexed seller, uint256 totalSales);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function rateSeller(
        address seller,
        bytes32 orderId,
        uint8 score,
        uint8 quality,
        uint8 shipping,
        uint8 communication
    ) external {
        require(seller != address(0), "Invalid seller");
        require(score >= 1 && score <= 5, "Score 1-5");
        require(quality >= 1 && quality <= 5, "Quality 1-5");
        require(shipping >= 1 && shipping <= 5, "Shipping 1-5");
        require(communication >= 1 && communication <= 5, "Comm 1-5");
        require(orderId != bytes32(0), "OrderId required");
        require(!ratedOrder[seller][orderId], "Order rated");
        require(!ratedBuyerSeller[seller][msg.sender], "Buyer already rated seller");

        uint256 weight = _computeWeight(block.timestamp);

        Rating memory newRating = Rating({
            buyer: msg.sender,
            overall: score,
            quality: quality,
            shipping: shipping,
            communication: communication,
            timestamp: block.timestamp,
            orderId: orderId
        });

        ratings.push(newRating);
        uint256 idx = ratings.length - 1;
        sellerRatings[seller].push(idx);
        ratedOrder[seller][orderId] = true;
        ratedBuyerSeller[seller][msg.sender] = true;

        distribution[seller][score - 1] += 1;
        SellerSnapshot storage snapshot = sellers[seller];
        snapshot.weightedScoreSum += uint256(score) * weight;
        snapshot.weightSum += weight;
        snapshot.totalRatings += 1;

        emit SellerRated(seller, msg.sender, score, orderId, weight);
    }

    function verifySeller(address seller, bool verified) external onlyOwner {
        sellers[seller].verified = verified;
        emit SellerVerified(seller, verified);
    }

    function addSales(address seller, uint256 increment) external onlyOwner {
        sellers[seller].totalSales += increment;
        emit SalesUpdated(seller, sellers[seller].totalSales);
    }

    function setSales(address seller, uint256 totalSales) external onlyOwner {
        sellers[seller].totalSales = totalSales;
        emit SalesUpdated(seller, totalSales);
    }

    function getSellerReputation(address seller)
        external
        view
        returns (
            uint256 reputationPercent,
            uint256 totalRatings,
            uint256 totalSales,
            bool verified
        )
    {
        SellerSnapshot memory snap = sellers[seller];
        if (snap.weightSum == 0) {
            return (0, 0, snap.totalSales, snap.verified);
        }
        uint256 avg = (snap.weightedScoreSum * 100) / (snap.weightSum * 5);
        return (avg, snap.totalRatings, snap.totalSales, snap.verified);
    }

    function getSellerDistribution(address seller) external view returns (uint256[5] memory) {
        return distribution[seller];
    }

    function getRatings(address seller) external view returns (Rating[] memory) {
        uint256[] memory ids = sellerRatings[seller];
        Rating[] memory sellerRatingList = new Rating[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            sellerRatingList[i] = ratings[ids[i]];
        }
        return sellerRatingList;
    }

    function hasRated(address seller, bytes32 orderId) external view returns (bool) {
        return ratedOrder[seller][orderId];
    }

    function _computeWeight(uint256 timestamp) internal view returns (uint256) {
        uint256 age = block.timestamp - timestamp;

        if (age <= 7 days) {
            return _weightForBand(WeightBand.Recent);
        } else if (age <= 30 days) {
            return _weightForBand(WeightBand.Month);
        } else if (age <= 90 days) {
            return _weightForBand(WeightBand.Quarter);
        } else if (age <= 180 days) {
            return _weightForBand(WeightBand.HalfYear);
        }
        return _weightForBand(WeightBand.Old);
    }

    function _weightForBand(WeightBand band) internal pure returns (uint256) {
        if (band == WeightBand.Recent) return 5;
        if (band == WeightBand.Month) return 4;
        if (band == WeightBand.Quarter) return 3;
        if (band == WeightBand.HalfYear) return 2;
        return 1;
    }
}
