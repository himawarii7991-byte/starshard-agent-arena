// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Starshard Arena — on-chain leaderboard gated by Binance Agent ID
/// @author Minky / Cooper
/// @notice STARSHARD players submit their best score on-chain. Only addresses
///         holding a SPACE ID Agent ID (name.ai) may submit, and the submitted
///         name must resolve to the caller's own Agent ID token:
///         ownerOf(uint256(keccak256(bytes(name)))) == msg.sender.
///         This makes every leaderboard row provably tied to a real Agent ID,
///         so the board cannot be farmed by throwaway addresses.
/// @dev No external imports — the minimal IAgentID interface is inlined to
///      keep bytecode (and deployment gas) small. No payable functions, no
///      token approvals, no withdrawals, no pausing, no admin functions:
///      after deployment the owner has NO special powers (see README).

/// @notice Minimal interface of the SPACE ID Agent ID registry (ERC-721).
interface IAgentID {
    function balanceOf(address account) external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
}

contract StarshardArena {
    /// @notice The SPACE ID Agent ID registry on BNB Chain.
    IAgentID public immutable agentId;

    /// @notice Deployer address, recorded for transparency only.
    ///         The owner has NO privileged functions in this contract.
    address public immutable owner;

    /// @notice Caller holds no Agent ID.
    error NotAgentIdHolder();
    /// @notice The submitted name is not the caller's Agent ID
    ///         (or no such Agent ID exists).
    error NameMismatch();

    /// @notice Best score ever submitted by each player.
    mapping(address => uint256) public bestScore;
    /// @notice Agent ID name (without .ai suffix) each player plays under.
    mapping(address => string) public agentName;
    /// @notice Whether an address has ever submitted (drives the players list).
    mapping(address => bool) public hasPlayed;

    /// @notice All unique players, in order of first submission.
    address[] private players;
    /// @notice Total number of score submissions (all players, all time).
    uint256 public totalSubmissions;

    /// @notice Emitted on every accepted submission.
    event ScoreSubmitted(
        address indexed player,
        string agentName,
        uint256 score,
        uint256 best,
        uint256 timestamp
    );
    /// @notice Emitted when a submission beats the player's previous best.
    event NewBest(address indexed player, string agentName, uint256 score);

    /// @param _agentId Address of the Agent ID registry
    ///        (BNB Chain mainnet: 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F).
    constructor(address _agentId) {
        agentId = IAgentID(_agentId);
        owner = msg.sender;
    }

    /// @notice Submit a STARSHARD score. Requires an Agent ID, and `name`
    ///         must be the caller's own Agent ID name.
    /// @param score The score achieved in the game.
    /// @param name The caller's Agent ID name (e.g. "minkymomo", no .ai suffix).
    function submitScore(uint256 score, string calldata name) external {
        if (agentId.balanceOf(msg.sender) == 0) revert NotAgentIdHolder();

        // ownerOf reverts for a nonexistent token; normalise that to
        // NameMismatch so callers get one clear failure mode.
        address tokenOwner;
        try agentId.ownerOf(uint256(keccak256(bytes(name)))) returns (
            address o
        ) {
            tokenOwner = o;
        } catch {
            revert NameMismatch();
        }
        if (tokenOwner != msg.sender) revert NameMismatch();

        if (!hasPlayed[msg.sender]) {
            hasPlayed[msg.sender] = true;
            agentName[msg.sender] = name;
            players.push(msg.sender);
        }

        uint256 best = bestScore[msg.sender];
        if (score > best) {
            bestScore[msg.sender] = score;
            best = score;
            emit NewBest(msg.sender, name, score);
        }

        totalSubmissions += 1;
        emit ScoreSubmitted(msg.sender, name, score, best, block.timestamp);
    }

    /// @notice Number of unique players on the leaderboard.
    function playerCount() external view returns (uint256) {
        return players.length;
    }

    /// @notice Player address at a leaderboard index (order of first play).
    function getPlayer(uint256 index) external view returns (address) {
        return players[index];
    }
}
