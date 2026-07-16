// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice The narrow slice of ServiceRating this contract is allowed to reach.
///         Deliberately just one function - no generic call surface exists
///         anywhere in SessionPermission, so "can only ever submit a rating"
///         is a structural property of the bytecode, not a runtime check.
interface IServiceRatingRelay {
    function submitRatingFor(address rater, bytes32 cityId, bytes32 serviceId, uint8 value, string calldata tag)
        external
        payable;
}

/// @title SessionPermission
/// @notice Scopes the auto-sign ("ratings only") flow to a single onchain
///         capability: a user-granted, expiring, user-revocable session key
///         that can call nothing on ServiceRating except submitRatingFor, and
///         nothing on any other contract at all. Deployed separately from the
///         already-audited ServiceRating/TravelerCredential contracts, which
///         this contract does not modify - it only needs RELAYER_ROLE granted
///         to its own address on ServiceRating (see deploy script).
contract SessionPermission {
    struct Grant {
        address user;
        uint64 expiry;
        bool revoked;
    }

    IServiceRatingRelay public immutable serviceRating;

    mapping(address => Grant) private _grants; // sessionKey => Grant

    event SessionGranted(address indexed user, address indexed sessionKey, uint64 expiry);
    event SessionRevoked(address indexed user, address indexed sessionKey);

    error ZeroAddress();
    error InvalidExpiry();
    error SessionKeyInUse();
    error SessionNotFound();
    error SessionRevokedError();
    error SessionExpired();
    error NotSessionOwner();
    error RefundFailed();

    constructor(address serviceRating_) {
        if (serviceRating_ == address(0)) revert ZeroAddress();
        serviceRating = IServiceRatingRelay(serviceRating_);
    }

    /// @notice Authorize `sessionKey` to submit ratings on the caller's behalf
    ///         until `expiry`. Re-granting your own already-active session key
    ///         just extends/updates it; granting a session key that's still
    ///         actively held by a *different* user reverts rather than
    ///         silently reassigning it.
    function grantSession(address sessionKey, uint64 expiry) external {
        if (sessionKey == address(0)) revert ZeroAddress();
        if (expiry <= block.timestamp) revert InvalidExpiry();

        Grant storage g = _grants[sessionKey];
        bool isActive = g.user != address(0) && !g.revoked && block.timestamp < g.expiry;
        if (isActive && g.user != msg.sender) revert SessionKeyInUse();

        g.user = msg.sender;
        g.expiry = expiry;
        g.revoked = false;

        emit SessionGranted(msg.sender, sessionKey, expiry);
    }

    /// @notice Immediately revoke a session key you granted. No grace window -
    ///         the very next call using this key fails. Only the granting user
    ///         may revoke; the session key itself has no authority to.
    function revokeSession(address sessionKey) external {
        Grant storage g = _grants[sessionKey];
        if (g.user == address(0)) revert SessionNotFound();
        if (g.user != msg.sender) revert NotSessionOwner();

        g.revoked = true;
        emit SessionRevoked(msg.sender, sessionKey);
    }

    /// @notice Read-only check: is `sessionKey` currently valid for `user`?
    function isValidSession(address sessionKey, address user) public view returns (bool) {
        if (user == address(0)) return false;
        Grant storage g = _grants[sessionKey];
        return g.user == user && !g.revoked && block.timestamp < g.expiry;
    }

    /// @notice The sole entrypoint: called directly by a granted session key
    ///         to submit a rating for the user who granted it. Any fee
    ///         overpayment refunded by ServiceRating is forwarded back to the
    ///         session key (the caller), never stranded in this contract.
    function submitRatingViaSession(bytes32 cityId, bytes32 serviceId, uint8 value, string calldata tag)
        external
        payable
    {
        Grant storage g = _grants[msg.sender];
        address user = g.user;
        if (user == address(0)) revert SessionNotFound();
        if (g.revoked) revert SessionRevokedError();
        if (block.timestamp >= g.expiry) revert SessionExpired();

        uint256 balanceBeforeCall = address(this).balance;
        serviceRating.submitRatingFor{value: msg.value}(user, cityId, serviceId, value, tag);
        uint256 balanceAfterCall = address(this).balance;

        uint256 refund = balanceAfterCall + msg.value - balanceBeforeCall;
        if (refund > 0) {
            (bool sent,) = msg.sender.call{value: refund}("");
            if (!sent) revert RefundFailed();
        }
    }

    receive() external payable {}
}
