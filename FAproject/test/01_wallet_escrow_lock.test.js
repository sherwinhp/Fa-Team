const WalletContract = artifacts.require("WalletContract");

const toWei = (value) => web3.utils.toWei(value, "ether");
const toBN = (value) => web3.utils.toBN(value);

contract("Scenario 1 - Wallet escrow locks buyer balance", (accounts) => {
  const admin = accounts[0];
  const buyer = accounts[1];
  const seller = accounts[2];

  it("locks buyer balance and stores escrow record", async () => {
    const wallet = await WalletContract.new({ from: admin });
    const deposit = toWei("1");
    const escrowAmount = toWei("0.4");
    const escrowId = web3.utils.keccak256("escrow-one");

    await wallet.topUp({ from: buyer, value: deposit });
    await wallet.createEscrow(escrowId, seller, escrowAmount, { from: buyer });

    const buyerBalance = await wallet.balanceOf(buyer);
    const esc = await wallet.escrows(escrowId);

    assert.equal(buyerBalance.toString(), toBN(deposit).sub(toBN(escrowAmount)).toString());
    assert.equal(esc.buyer, buyer);
    assert.equal(esc.seller, seller);
    assert.equal(esc.amount.toString(), escrowAmount);
    assert.equal(esc.released, false);
    assert.equal(esc.refunded, false);
  });
});
