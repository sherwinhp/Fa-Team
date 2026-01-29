const ShippingTrackerContract = artifacts.require("ShippingTrackerContract");
const DocumentNotaryContract = artifacts.require("DocumentNotaryContract");

const toWei = (value) => web3.utils.toWei(value, "ether");

const expectRevert = async (promise, message = "") => {
  try {
    await promise;
    assert.fail("Expected revert not received");
  } catch (error) {
    assert.ok(error.message.includes("revert"), `Expected revert, got: ${error.message}`);
    if (message) {
      assert.ok(error.message.includes(message), `Expected message "${message}", got: ${error.message}`);
    }
  }
};

contract("Scenario 6 - Notary buyer-only invoice registration", (accounts) => {
  const admin = accounts[0];
  const buyer = accounts[1];
  const seller = accounts[2];

  it("allows only buyer to register invoice for an order", async () => {
    const shipping = await ShippingTrackerContract.new({ from: admin });
    const notary = await DocumentNotaryContract.new({ from: admin });

    await notary.setShippingContract(shipping.address, { from: admin });

    const trackingId = "TRK-NOTARY-1";
    const shipmentValue = toWei("0.2");
    await shipping.createShipment(
      trackingId,
      "Sender",
      "Sender address",
      "Recipient",
      "Recipient address",
      "Test item",
      shipmentValue,
      { from: buyer, value: shipmentValue }
    );

    const invoiceHash = web3.utils.keccak256("invoice-1");

    await expectRevert(
      notary.registerInvoice(trackingId, invoiceHash, { from: seller }),
      "Only buyer can register"
    );

    await notary.registerInvoice(trackingId, invoiceHash, { from: buyer });
    const invoice = await notary.getInvoice(trackingId);

    assert.equal(invoice.buyer, buyer);
    assert.equal(invoice.invoiceHash, invoiceHash);
    assert.equal(invoice.status.toString(), "0");
  });
});
