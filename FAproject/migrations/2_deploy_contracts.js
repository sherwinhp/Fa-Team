const WalletContract = artifacts.require("WalletContract");
const ReputationContract = artifacts.require("ReputationContract");
const ReviewContract = artifacts.require("ReviewContract");
const UserManagementContract = artifacts.require("UserManagementContract");
const DocumentNotaryContract = artifacts.require("DocumentNotaryContract");

module.exports = async function (deployer) {
  await deployer.deploy(UserManagementContract);
  await deployer.deploy(WalletContract);
  await deployer.deploy(ReputationContract);
  await deployer.deploy(ReviewContract);
  await deployer.deploy(DocumentNotaryContract);
};
