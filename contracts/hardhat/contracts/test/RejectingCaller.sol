// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Test-only helper. Has no receive()/fallback(), so any plain ETH
///         transfer sent to it reverts - used to force TreasuryTransferFailed
///         on both the treasury-send and refund-send paths in ServiceRating.
interface IServiceRatingCall {
    function submitRating(bytes32 cityId, bytes32 serviceId, uint8 value, string calldata tag) external payable;
}

contract RejectingCaller {
    IServiceRatingCall public immutable target;

    constructor(address target_) {
        target = IServiceRatingCall(target_);
    }

    function fund() external payable {}

    function callSubmitRating(
        bytes32 cityId,
        bytes32 serviceId,
        uint8 value,
        string calldata tag,
        uint256 amount
    ) external {
        target.submitRating{value: amount}(cityId, serviceId, value, tag);
    }
}
