const ShippingTrackerContract = artifacts.require("ShippingTrackerContract");

module.exports = function(deployer){
    deployer.deploy(ShippingTrackerContract);
};
