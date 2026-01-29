const ReviewContract = artifacts.require("ReviewContract");

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

contract("Scenario 5 - Review submission rules", (accounts) => {
  const admin = accounts[0];
  const buyer = accounts[1];

  it("records review and blocks duplicate purchaseId", async () => {
    const review = await ReviewContract.new({ from: admin });
    const productId = web3.utils.keccak256("product-1");
    const purchaseId = web3.utils.keccak256("purchase-1");
    const deliveryTxHash = web3.utils.keccak256("delivery-1");

    await review.submitReview(productId, purchaseId, 4, "comment", "", deliveryTxHash, { from: buyer });

    const hasReviewed = await review.hasReviewed(purchaseId);
    const avg = await review.getAverageRating(productId);

    assert.equal(hasReviewed, true);
    assert.equal(avg[0].toString(), "80");
    assert.equal(avg[1].toString(), "1");

    await expectRevert(
      review.submitReview(productId, purchaseId, 5, "comment2", "", deliveryTxHash, { from: buyer }),
      "Purchase already reviewed"
    );
  });
});
