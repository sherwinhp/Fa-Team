const ShippingTrackerContract = artifacts.require("ShippingTrackerContract");

const toWei = (value) => web3.utils.toWei(value, "ether");

contract("Scenario 4 - Shipping release on delivered status", (accounts) => {
  const admin = accounts[0];
  const buyer = accounts[1];

  it("releases escrow when status becomes Delivered", async () => {
    const shipping = await ShippingTrackerContract.new({ from: admin });
    const trackingId = "TRK-ESCROW-2";
    const shipmentValue = toWei("0.3");

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

    await shipping.updateShipmentStatus(
      trackingId,
      4,
      "Delivered address",
      "Delivered by admin",
      { from: admin }
    );

    const escrowBalance = await shipping.getEscrowBalance();
    const shipment = await shipping.getShipment(trackingId);
    const contractBalance = await web3.eth.getBalance(shipping.address);

    assert.equal(escrowBalance.toString(), "0");
    assert.equal(shipment.paymentReleased, true);
    assert.equal(contractBalance.toString(), "0");
  });
});
