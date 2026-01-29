const WalletContract = artifacts.require("WalletContract");

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

contract("Scenario 2 - Wallet escrow release permissions", (accounts) => {
  const admin = accounts[0];
  const buyer = accounts[1];
  const seller = accounts[2];

  it("allows only buyer to release escrow to seller", async () => {
    const wallet = await WalletContract.new({ from: admin });
    const deposit = toWei("1");
    const escrowAmount = toWei("0.5");
    const escrowId = web3.utils.keccak256("escrow-two");

    await wallet.topUp({ from: buyer, value: deposit });
    await wallet.createEscrow(escrowId, seller, escrowAmount, { from: buyer });

    await expectRevert(wallet.releaseEscrow(escrowId, { from: seller }), "Only buyer");
    await wallet.releaseEscrow(escrowId, { from: buyer });

    const sellerBalance = await wallet.balanceOf(seller);
    assert.equal(sellerBalance.toString(), escrowAmount);
  });
});
