// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title FarmLTVGuard
 * @notice Enforces a 25% LTV ceiling for a single farm / SPV.
 *
 * This contract is a conceptual guardrail for the Tokenise.Farm model.
 * In production, it would be wired to the HederaTokenService precompile
 * so that ALL minting of the farm's HTS token must respect the 25% rule.
 *
 * For the hackathon, the JS backend demonstrates real HTS minting,
 * and this contract shows how an EVM guard would look on Hedera.
 */
contract FarmLTVGuard {
    address public owner;
    address public farmOwner;
    address public oracle;
    address public fmnToken; // FarmNote token (HTS-wrapped)

    uint256 public farmValuation;      // in smallest units (e.g. GBP cents)
    uint256 public maxLTVBps = 2500;   // 25.00% (10000 = 100%)
    uint256 public totalMinted;        // total FMN minted under this farm

    event ValuationUpdated(uint256 oldVal, uint256 newVal, address indexed updater);
    event MintRequested(address indexed to, uint256 amount);
    event MintBlocked(address indexed to, uint256 amount, string reason);
    event MintExecuted(address indexed to, uint256 amount, uint256 newTotalMinted);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyOracle() {
        require(msg.sender == oracle, "Not oracle");
        _;
    }

    modifier onlyOwnerOrFarm() {
        require(msg.sender == owner || msg.sender == farmOwner, "Not authorised");
        _;
    }

    constructor(
        address _owner,
        address _farmOwner,
        address _oracle,
        address _fmnToken,
        uint256 _initialValuation
    ) {
        owner = _owner;
        farmOwner = _farmOwner;
        oracle = _oracle;
        fmnToken = _fmnToken;
        farmValuation = _initialValuation;
    }

    function updateFarmValuation(uint256 _newVal) external onlyOracle {
        require(_newVal > 0, "Valuation must be > 0");
        uint256 old = farmValuation;
        farmValuation = _newVal;
        emit ValuationUpdated(old, _newVal, msg.sender);
    }

    function setOracle(address _newOracle) external onlyOwner {
        require(_newOracle != address(0), "Zero address");
        oracle = _newOracle;
    }

    function currentLTVBps() public view returns (uint256) {
        if (farmValuation == 0) return 0;
        return (totalMinted * 10_000) / farmValuation;
    }

    function remainingCapacity() public view returns (uint256) {
        uint256 maxDebt = (farmValuation * maxLTVBps) / 10_000;
        if (maxDebt <= totalMinted) return 0;
        return maxDebt - totalMinted;
    }

    /**
     * @notice Mint FMN to `to`, respecting the 25% LTV ceiling.
     * @dev In a full implementation this would call HederaTokenService.mintToken
     *      for `fmnToken`, and optionally transfer from treasury to `to`.
     *
     *      Here we simulate the accounting and enforce the maths for judges.
     */
    function mintTo(address to, uint256 amount) external onlyOwnerOrFarm {
        emit MintRequested(to, amount);

        require(amount > 0, "Amount must be > 0");

        uint256 maxDebt = (farmValuation * maxLTVBps) / 10_000;
        uint256 newTotal = totalMinted + amount;

        if (newTotal > maxDebt) {
            emit MintBlocked(to, amount, "Would exceed 25% LTV");
            revert("LTV limit exceeded");
        }

        // --- TODO: Wire to HederaTokenService precompile on Hedera EVM ---
        // Pseudo-code:
        // (int64 responseCode, int64 newTotalSupply) =
        //     hederaTokenService.mintToken(fmnToken, int64(amount), new bytes);
        // require(responseCode == 22 /* SUCCESS */, "HTS mint failed");

        // For hackathon: track accounting only
        totalMinted = newTotal;
        emit MintExecuted(to, amount, newTotal);
    }
}
