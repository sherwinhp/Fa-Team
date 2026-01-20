// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title UserManagementContract
 * @notice Lightweight on-chain registry for wallet roles and account status.
 */
contract UserManagementContract {
    enum Role {
        NONE,
        USER,
        ADMIN,
        SUPER_ADMIN
    }

    struct UserProfile {
        Role role;
        bool active;
        uint256 createdAt;
        uint256 lastUpdated;
    }

    mapping(address => UserProfile) private profiles;
    address public superAdmin;

    event UserRegistered(address indexed user, Role role);
    event RoleUpdated(address indexed user, Role role);
    event StatusUpdated(address indexed user, bool active);

    modifier onlySuperAdmin() {
        require(msg.sender == superAdmin, "Only super admin");
        _;
    }

    modifier onlyAdmin() {
        Role r = profiles[msg.sender].role;
        require(r == Role.ADMIN || r == Role.SUPER_ADMIN, "Only admin");
        _;
    }

    constructor() {
        superAdmin = msg.sender;
        profiles[msg.sender] = UserProfile({
            role: Role.SUPER_ADMIN,
            active: true,
            createdAt: block.timestamp,
            lastUpdated: block.timestamp
        });
        emit UserRegistered(msg.sender, Role.SUPER_ADMIN);
    }

    function registerUser(address user) external {
        require(user != address(0), "Invalid user");
        UserProfile storage profile = profiles[user];
        require(profile.role == Role.NONE, "Already registered");

        profiles[user] = UserProfile({
            role: Role.USER,
            active: true,
            createdAt: block.timestamp,
            lastUpdated: block.timestamp
        });
        emit UserRegistered(user, Role.USER);
    }

    function promoteToAdmin(address user) external onlySuperAdmin {
        _setRole(user, Role.ADMIN);
    }

    function demoteToUser(address user) external onlySuperAdmin {
        require(user != superAdmin, "Cannot demote super admin");
        _setRole(user, Role.USER);
    }

    function transferSuperAdmin(address newSuperAdmin) external onlySuperAdmin {
        require(newSuperAdmin != address(0), "Invalid address");
        _setRole(superAdmin, Role.ADMIN);
        superAdmin = newSuperAdmin;
        _setRole(newSuperAdmin, Role.SUPER_ADMIN);
    }

    function setStatus(address user, bool active) external onlyAdmin {
        require(user != address(0), "Invalid user");
        UserProfile storage profile = profiles[user];
        require(profile.role != Role.NONE, "Not registered");
        if (user == superAdmin) {
            require(active, "Cannot deactivate super admin");
        }
        profile.active = active;
        profile.lastUpdated = block.timestamp;
        emit StatusUpdated(user, active);
    }

    function getUser(address user) external view returns (UserProfile memory) {
        return profiles[user];
    }

    function _setRole(address user, Role role) internal {
        require(user != address(0), "Invalid user");
        UserProfile storage profile = profiles[user];
        require(profile.role != Role.NONE, "Not registered");
        profile.role = role;
        profile.lastUpdated = block.timestamp;
        emit RoleUpdated(user, role);
    }
}
