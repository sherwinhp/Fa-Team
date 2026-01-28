const ProductCatalog = artifacts.require("ProductCatalog");
const MarketplaceCart = artifacts.require("MarketplaceCart");
const DocumentNotaryContract = artifacts.require("DocumentNotaryContract");
const ShippingTrackerContract = artifacts.require("ShippingTrackerContract");

module.exports = async function (deployer, _network, accounts) {
  const catalog = await ProductCatalog.deployed();
  await deployer.deploy(MarketplaceCart, catalog.address);

  try {
    const notary = await DocumentNotaryContract.deployed();
    const shipping = await ShippingTrackerContract.deployed();
    await notary.setShippingContract(shipping.address, {
      from: accounts && accounts.length ? accounts[0] : undefined
    });
  } catch (err) {
    // Ignore wiring errors so deployment doesn't fail on existing chains.
  }
};
