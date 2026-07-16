// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISessionPermissionForReentrancy {
    function submitRatingViaSession(bytes32 cityId, bytes32 serviceId, uint8 value, string calldata tag)
        external
        payable;
}

/// @notice Test-only stand-in for ServiceRating that attempts to reenter
///         SessionPermission.submitRatingViaSession mid-call, to prove that
///         doing so can't corrupt refund accounting or strand funds.
contract MaliciousServiceRating {
    ISessionPermissionForReentrancy public attacker;
    bool public reentered;
    bool public reentryReverted;

    function setAttacker(address a) external {
        attacker = ISessionPermissionForReentrancy(a);
    }

    function submitRatingFor(address, bytes32 cityId, bytes32 serviceId, uint8 value, string calldata tag)
        external
        payable
    {
        if (address(attacker) != address(0) && !reentered) {
            reentered = true;
            try attacker.submitRatingViaSession(cityId, serviceId, value, tag) {
                // no-op: if this ever succeeds it would indicate a real problem
            } catch {
                reentryReverted = true;
            }
        }
        if (msg.value > 0) {
            (bool sent,) = msg.sender.call{value: msg.value}("");
            require(sent, "refund failed");
        }
    }
}
