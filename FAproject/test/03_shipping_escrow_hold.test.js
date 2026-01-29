const ShippingTrackerContract = artifacts.require("ShippingTrackerContract");

const toWei = (value) => web3.utils.toWei(value, "ether");

contract("Scenario 3 - Shipping escrow holds funds", (accounts) => {
  const admin = accounts[0];
  const buyer = accounts[1];

  it("holds funds in escrow after purchase", async () => {
    const shipping = await ShippingTrackerContract.new({ from: admin });
    const trackingId = "TRK-ESCROW-1";
    const shipmentValue = toWei("0.75");

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

    const escrowBalance = await shipping.getEscrowBalance();
    const shipment = await shipping.getShipment(trackingId);
    const contractBalance = await web3.eth.getBalance(shipping.address);

    assert.equal(escrowBalance.toString(), shipmentValue);
    assert.equal(shipment.paymentReleased, false);
    assert.equal(contractBalance.toString(), shipmentValue);
  });
});
