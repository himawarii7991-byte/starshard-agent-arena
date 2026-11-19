// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MockAgentID — minimal stand-in for the SPACE ID Agent ID registry
/// @notice Test-only mock. Token IDs are uint256(keccak256(bytes(name))),
///         matching the real registry. Non-transferable, one mint per name.
contract MockAgentID {
    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;

    error AlreadyMinted();
    error NonexistentToken();

    function mint(address to, string calldata name) external {
        uint256 tokenId = uint256(keccak256(bytes(name)));
        if (_owners[tokenId] != address(0)) revert AlreadyMinted();
        _owners[tokenId] = to;
        _balances[to] += 1;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        address o = _owners[tokenId];
        if (o == address(0)) revert NonexistentToken();
        return o;
    }
}
