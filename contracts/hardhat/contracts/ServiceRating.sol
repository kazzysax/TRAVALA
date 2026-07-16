// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title ServiceRating
/// @notice Stores traveler ratings of local services (cabs, restaurants, etc.)
///         onchain, pseudonymously by wallet address. Each rating carries both
///         a `cityId` and a `serviceId`, so the data becomes a reusable public
///         resource: the next traveler to a city can query by cityId and read
///         real ratings left by people who were actually there. Ratings are
///         permanent and tamper-resistant. Each submission pays a flat platform
///         fee in MON, collected to a treasury address.
contract ServiceRating is AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    struct Rating {
        address rater;
        bytes32 cityId;    // which city this rating was made in (e.g. keccak256("Lisbon,Portugal"))
        bytes32 serviceId; // which service was rated
        uint8 value;       // 1-5 stars
        string tag;         // short optional tag, e.g. "overcharged", "great food"
        uint64 timestamp;
    }

    uint256 public platformFee = 0.1 ether; // 0.1 MON
    address public treasury;
    uint256 public dailyRatingLimit = 20;

    Rating[] private _ratings;

    // serviceId => indices (a service's ratings across all time)
    mapping(bytes32 => uint256[]) private _ratingsByService;
    // cityId => indices (every rating made in a city - the "what's it like here" feed)
    mapping(bytes32 => uint256[]) private _ratingsByCity;
    // cityId => serviceId => indices (a specific service within a specific city)
    mapping(bytes32 => mapping(bytes32 => uint256[])) private _ratingsByCityService;
    // wallet => cityId => indices (a traveler's ratings in one city - powers the stamp view)
    mapping(address => mapping(bytes32 => uint256[])) private _ratingsByRaterCity;

    // wallet => day bucket => count
    mapping(address => mapping(uint256 => uint256)) private _dailyCount;

    event RatingSubmitted(
        address indexed rater,
        bytes32 indexed cityId,
        bytes32 indexed serviceId,
        uint256 ratingIndex,
        uint8 value,
        string tag,
        uint64 timestamp
    );
    event PlatformFeeUpdated(uint256 oldFee, uint256 newFee);
    event TreasuryUpdated(address oldTreasury, address newTreasury);
    event DailyLimitUpdated(uint256 oldLimit, uint256 newLimit);

    error InsufficientFee(uint256 required, uint256 sent);
    error InvalidRatingValue();
    error DailyLimitExceeded();
    error TreasuryTransferFailed();
    error ZeroAddress();
    error EmptyCityOrService();

    constructor(address admin, address treasury_) {
        if (admin == address(0) || treasury_ == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        treasury = treasury_;
    }

    // ---------------------------------------------------------------------
    // Submit
    // ---------------------------------------------------------------------

    /// @notice Rate a service directly from your own wallet (manual-sign path).
    function submitRating(bytes32 cityId, bytes32 serviceId, uint8 value, string calldata tag)
        external
        payable
    {
        _submitRating(msg.sender, cityId, serviceId, value, tag);
    }

    /// @notice Rate on behalf of `rater` via an authorized relayer (auto-sign path).
    ///         Only callable by a RELAYER_ROLE holder - the sole entry point the
    ///         ratings-only auto-sign flow is allowed to reach.
    function submitRatingFor(address rater, bytes32 cityId, bytes32 serviceId, uint8 value, string calldata tag)
        external
        payable
        onlyRole(RELAYER_ROLE)
    {
        if (rater == address(0)) revert ZeroAddress();
        _submitRating(rater, cityId, serviceId, value, tag);
    }

    function _submitRating(address rater, bytes32 cityId, bytes32 serviceId, uint8 value, string calldata tag) internal {
        if (cityId == bytes32(0) || serviceId == bytes32(0)) revert EmptyCityOrService();
        if (value < 1 || value > 5) revert InvalidRatingValue();
        if (msg.value < platformFee) revert InsufficientFee(platformFee, msg.value);

        uint256 today = block.timestamp / 1 days;
        uint256 countToday = _dailyCount[rater][today];
        if (countToday >= dailyRatingLimit) revert DailyLimitExceeded();
        _dailyCount[rater][today] = countToday + 1;

        uint64 ts = uint64(block.timestamp);
        _ratings.push(Rating({rater: rater, cityId: cityId, serviceId: serviceId, value: value, tag: tag, timestamp: ts}));
        uint256 idx = _ratings.length - 1;

        _ratingsByService[serviceId].push(idx);
        _ratingsByCity[cityId].push(idx);
        _ratingsByCityService[cityId][serviceId].push(idx);
        _ratingsByRaterCity[rater][cityId].push(idx);

        (bool sentFee, ) = treasury.call{value: platformFee}("");
        if (!sentFee) revert TreasuryTransferFailed();

        uint256 refund = msg.value - platformFee;
        if (refund > 0) {
            (bool sentRefund, ) = msg.sender.call{value: refund}("");
            if (!sentRefund) revert TreasuryTransferFailed();
        }

        emit RatingSubmitted(rater, cityId, serviceId, idx, value, tag, ts);
    }

    // ---------------------------------------------------------------------
    // Reads - global
    // ---------------------------------------------------------------------

    function totalRatings() external view returns (uint256) {
        return _ratings.length;
    }

    function getRating(uint256 index) external view returns (Rating memory) {
        return _ratings[index];
    }

    function ratingsRemainingToday(address rater) external view returns (uint256) {
        uint256 today = block.timestamp / 1 days;
        uint256 used = _dailyCount[rater][today];
        return used >= dailyRatingLimit ? 0 : dailyRatingLimit - used;
    }

    // ---------------------------------------------------------------------
    // Reads - the reusable city resource (the flywheel)
    // ---------------------------------------------------------------------

    /// @notice How many ratings exist for a whole city.
    function getCityRatingCount(bytes32 cityId) external view returns (uint256) {
        return _ratingsByCity[cityId].length;
    }

    /// @notice A page of ratings for a city. Paginated so a busy city doesn't
    ///         blow the gas/return limit.
    function getCityRatings(bytes32 cityId, uint256 offset, uint256 limit)
        external
        view
        returns (Rating[] memory page)
    {
        return _paginate(_ratingsByCity[cityId], offset, limit);
    }

    /// @notice Average rating for one service *within one city* (scaled x100,
    ///         e.g. 437 = 4.37), plus the number of ratings behind it. This is
    ///         what a new arrival reads to decide "is this cab worth it here?"
    function getCityServiceAverage(bytes32 cityId, bytes32 serviceId)
        external
        view
        returns (uint256 avgTimes100, uint256 count)
    {
        uint256[] storage idxs = _ratingsByCityService[cityId][serviceId];
        count = idxs.length;
        if (count == 0) return (0, 0);
        uint256 sum;
        for (uint256 i = 0; i < count; i++) {
            sum += _ratings[idxs[i]].value;
        }
        avgTimes100 = (sum * 100) / count;
    }

    /// @notice All ratings for one service within one city (paginated).
    function getCityServiceRatings(bytes32 cityId, bytes32 serviceId, uint256 offset, uint256 limit)
        external
        view
        returns (Rating[] memory page)
    {
        return _paginate(_ratingsByCityService[cityId][serviceId], offset, limit);
    }

    // ---------------------------------------------------------------------
    // Reads - the "check a stamp" view: one traveler, in one city only
    // ---------------------------------------------------------------------

    /// @notice How many ratings a given wallet has left in a given city.
    ///         Pair this with the wallet's TravelerCredential stamp for that
    ///         city to render "here's what this traveler rated in Lisbon."
    function getRaterCityRatingCount(address rater, bytes32 cityId) external view returns (uint256) {
        return _ratingsByRaterCity[rater][cityId].length;
    }

    /// @notice The ratings a specific wallet left in a specific city (paginated).
    ///         Deliberately city-scoped: checking a stamp shows only that city's
    ///         activity, not the traveler's entire cross-city history.
    function getRaterCityRatings(address rater, bytes32 cityId, uint256 offset, uint256 limit)
        external
        view
        returns (Rating[] memory page)
    {
        return _paginate(_ratingsByRaterCity[rater][cityId], offset, limit);
    }

    // ---------------------------------------------------------------------
    // Internal pagination helper
    // ---------------------------------------------------------------------

    function _paginate(uint256[] storage idxs, uint256 offset, uint256 limit)
        internal
        view
        returns (Rating[] memory page)
    {
        uint256 total = idxs.length;
        if (offset >= total) return new Rating[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        page = new Rating[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = _ratings[idxs[i]];
        }
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setPlatformFee(uint256 newFee) external onlyRole(ADMIN_ROLE) {
        emit PlatformFeeUpdated(platformFee, newFee);
        platformFee = newFee;
    }

    function setTreasury(address newTreasury) external onlyRole(ADMIN_ROLE) {
        if (newTreasury == address(0)) revert ZeroAddress();
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    function setDailyRatingLimit(uint256 newLimit) external onlyRole(ADMIN_ROLE) {
        emit DailyLimitUpdated(dailyRatingLimit, newLimit);
        dailyRatingLimit = newLimit;
    }

    function grantRelayer(address relayer) external onlyRole(ADMIN_ROLE) {
        _grantRole(RELAYER_ROLE, relayer);
    }

    function revokeRelayer(address relayer) external onlyRole(ADMIN_ROLE) {
        _revokeRole(RELAYER_ROLE, relayer);
    }
}
