// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title WalletContract
 * @notice Simple custodial wallet ledger for ETHR with escrow support.
 * Balances are tracked inside the contract; users top up with native value
 * or via an admin mint. All balance changes emit events so off-chain services
 * can mirror activity and reconstruct history.
 */
contract WalletContract {
    enum TxType {
        TopUp,
        Transfer,
        EscrowCreate,
        EscrowRelease,
        EscrowRefund
    }

    struct Transaction {
        address from;
        address to;
        uint256 amount;
        uint256 timestamp;
        TxType txType;
        bytes32 txReference;
    }

    struct Escrow {
        address buyer;
        address seller;
        uint256 amount;
        bool released;
        bool refunded;
        uint256 createdAt;
    }

    address public owner;
    mapping(address => uint256) private balances;
    Transaction[] private transactions;
    mapping(address => uint256[]) private accountTransactions;
    mapping(bytes32 => Escrow) public escrows;

    event WalletFunded(address indexed wallet, uint256 amount, uint256 newBalance);
    event TransferExecuted(address indexed from, address indexed to, uint256 amount, uint256 newSenderBalance);
    event EscrowCreated(bytes32 indexed escrowId, address indexed buyer, address indexed seller, uint256 amount);
    event EscrowReleased(bytes32 indexed escrowId, address indexed buyer, address indexed seller, uint256 amount);
    event EscrowRefunded(bytes32 indexed escrowId, address indexed buyer, address indexed seller, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function balanceOf(address account) external view returns (uint256) {
        return balances[account];
    }

    /// @notice Native top up. Value sent is credited to the sender.
    function topUp() external payable {
        require(msg.value > 0, "No value sent");
        balances[msg.sender] += msg.value;
        _recordTransaction(msg.sender, msg.sender, msg.value, TxType.TopUp, bytes32(0));
        emit WalletFunded(msg.sender, msg.value, balances[msg.sender]);
    }

    /// @notice Admin mint utility for simulations and test credit.
    function mintCredit(address to, uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be positive");
        balances[to] += amount;
        _recordTransaction(address(0), to, amount, TxType.TopUp, keccak256(abi.encode(to, amount, block.timestamp)));
        emit WalletFunded(to, amount, balances[to]);
    }

    function transfer(address to, uint256 amount) external {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Zero amount");
        require(balances[msg.sender] >= amount, "Insufficient balance");

        balances[msg.sender] -= amount;
        balances[to] += amount;

        _recordTransaction(msg.sender, to, amount, TxType.Transfer, bytes32(0));
        emit TransferExecuted(msg.sender, to, amount, balances[msg.sender]);
    }

    /// @notice Creates an escrow record and locks buyer balance.
    function createEscrow(bytes32 escrowId, address seller, uint256 amount) external {
        require(seller != address(0), "Seller required");
        require(amount > 0, "Zero amount");
        require(escrows[escrowId].buyer == address(0), "Escrow exists");
        require(balances[msg.sender] >= amount, "Insufficient balance");

        balances[msg.sender] -= amount;
        escrows[escrowId] = Escrow({
            buyer: msg.sender,
            seller: seller,
            amount: amount,
            released: false,
            refunded: false,
            createdAt: block.timestamp
        });

        _recordTransaction(msg.sender, seller, amount, TxType.EscrowCreate, escrowId);
        emit EscrowCreated(escrowId, msg.sender, seller, amount);
    }

    /// @notice Buyer releases escrow to seller.
    function releaseEscrow(bytes32 escrowId) external {
        Escrow storage esc = escrows[escrowId];
        require(esc.buyer != address(0), "Escrow missing");
        require(msg.sender == esc.buyer, "Only buyer");
        require(!esc.released && !esc.refunded, "Escrow closed");

        esc.released = true;
        balances[esc.seller] += esc.amount;

        _recordTransaction(esc.buyer, esc.seller, esc.amount, TxType.EscrowRelease, escrowId);
        emit EscrowReleased(escrowId, esc.buyer, esc.seller, esc.amount);
    }

    /// @notice Buyer refunds escrow back to own balance.
    function refundEscrow(bytes32 escrowId) external {
        Escrow storage esc = escrows[escrowId];
        require(esc.buyer != address(0), "Escrow missing");
        require(msg.sender == esc.buyer, "Only buyer");
        require(!esc.released && !esc.refunded, "Escrow closed");

        esc.refunded = true;
        balances[esc.buyer] += esc.amount;

        _recordTransaction(esc.buyer, esc.buyer, esc.amount, TxType.EscrowRefund, escrowId);
        emit EscrowRefunded(escrowId, esc.buyer, esc.seller, esc.amount);
    }

    /// @notice View helper to compute a gas fee quote.
    function quoteGas(uint256 gasUnits, uint256 gasPriceWei) external pure returns (uint256) {
        return gasUnits * gasPriceWei;
    }

    /// @notice Returns the gas price seen by the current call.
    function currentGasPrice() external view returns (uint256) {
        return tx.gasprice;
    }

    function getTransactionCount() external view returns (uint256) {
        return transactions.length;
    }

    function getTransaction(uint256 txId) external view returns (Transaction memory) {
        require(txId < transactions.length, "Invalid tx id");
        return transactions[txId];
    }

    function getAccountTransactions(address account) external view returns (uint256[] memory) {
        return accountTransactions[account];
    }

    function _recordTransaction(
        address from,
        address to,
        uint256 amount,
        TxType txType,
        bytes32 txReference
    ) internal {
        transactions.push(
            Transaction({
                from: from,
                to: to,
                amount: amount,
                timestamp: block.timestamp,
                txType: txType,
                txReference: txReference
            })
        );

        uint256 txId = transactions.length - 1;
        accountTransactions[from].push(txId);
        if (to != from) {
            accountTransactions[to].push(txId);
        }
    }
}
