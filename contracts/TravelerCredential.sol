// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/// @title TravelerCredential
/// @notice Soulbound (non-transferable) ERC-721 "city stamp" issued when a user
///         sets their location in the app. One NFT per city visited, permanently
///         tied to the minting wallet. On-chain metadata is deliberately minimal:
///         country, city, and a per-token serial number only — no personal data.
contract TravelerCredential is ERC721, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    string public constant COLLECTION_NAME = "NATIVE";

    struct StampData {
        string country;
        string city;
        uint256 serial; // sequential serial number for this specific stamp
    }

    uint256 private _nextTokenId = 1;
    mapping(uint256 => StampData) private _stamps;

    event StampMinted(address indexed to, uint256 indexed tokenId, string country, string city, uint256 serial);

    error SoulboundTokenNoTransfer();

    constructor(address admin) ERC721("Traveler Credential", "STAMP") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
    }

    /// @notice Mints a new city-stamp NFT to `to`. Callable only by the backend
    ///         minter service, so minting is gated on the user actually completing
    ///         location setup in the app (prevents spam-minting / gas abuse).
    function mintStamp(address to, string calldata country, string calldata city)
        external
        onlyRole(MINTER_ROLE)
        returns (uint256 tokenId)
    {
        tokenId = _nextTokenId++;
        _stamps[tokenId] = StampData({country: country, city: city, serial: tokenId});
        _safeMint(to, tokenId);
        emit StampMinted(to, tokenId, country, city, tokenId);
    }

    function getStamp(uint256 tokenId) external view returns (string memory country, string memory city, uint256 serial) {
        _requireOwned(tokenId);
        StampData memory s = _stamps[tokenId];
        return (s.country, s.city, s.serial);
    }

    // ---------------------------------------------------------------------
    // Soulbound enforcement: block every transfer path except mint (from
    // address(0)) and burn (to address(0), not exposed here but kept safe).
    // ---------------------------------------------------------------------
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            revert SoulboundTokenNoTransfer();
        }
        return super._update(to, tokenId, auth);
    }

    function approve(address, uint256) public pure override {
        revert SoulboundTokenNoTransfer();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert SoulboundTokenNoTransfer();
    }

    // ---------------------------------------------------------------------
    // Metadata: fully on-chain, no external dependency. Image is an SVG
    // "stamp" showing collection name, city, country, and serial number.
    // ---------------------------------------------------------------------
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        StampData memory s = _stamps[tokenId];

        string memory image = Base64.encode(bytes(_buildSVG(s)));
        string memory json = string(
            abi.encodePacked(
                '{"name":"', COLLECTION_NAME, ' Stamp #', Strings.toString(s.serial), '",',
                '"description":"Soulbound traveler credential. Non-transferable proof of visiting ', s.city, ', ', s.country, '.",',
                '"attributes":[',
                    '{"trait_type":"Country","value":"', s.country, '"},',
                    '{"trait_type":"City","value":"', s.city, '"},',
                    '{"trait_type":"Serial","value":', Strings.toString(s.serial), '}',
                '],',
                '"image":"data:image/svg+xml;base64,', image, '"}'
            )
        );
        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(json))));
    }

    function _buildSVG(StampData memory s) internal pure returns (string memory) {
        string memory serialStr = Strings.toString(s.serial);
        return string(
            abi.encodePacked(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">',
                '<rect width="400" height="400" fill="#12181F"/>',
                '<circle cx="200" cy="200" r="170" fill="none" stroke="#E8B84B" stroke-width="3" stroke-dasharray="6 6"/>',
                '<circle cx="200" cy="200" r="150" fill="none" stroke="#E8B84B" stroke-width="1.5"/>',
                '<text x="200" y="120" text-anchor="middle" fill="#E8B84B" font-family="monospace" font-size="20" letter-spacing="4">', COLLECTION_NAME, '</text>',
                '<text x="200" y="200" text-anchor="middle" fill="#F7F3EA" font-family="serif" font-size="32" font-weight="bold">', s.city, '</text>',
                '<text x="200" y="235" text-anchor="middle" fill="#3FA9A0" font-family="monospace" font-size="16" letter-spacing="2">', s.country, '</text>',
                '<text x="200" y="300" text-anchor="middle" fill="#E8B84B" font-family="monospace" font-size="14">NO. ', serialStr, '</text>',
                '</svg>'
            )
        );
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
