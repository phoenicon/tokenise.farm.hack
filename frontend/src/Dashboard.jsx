import { useEffect, useState } from "react";

const API_BASE = "https://tokenise-farm-hack.onrender.com";

export default function Dashboard() {
  const [farmId, setFarmId] = useState("");
  const [farm, setFarm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadFarm = async () => {
      const stored = sessionStorage.getItem("farm");
      const parsed = stored ? JSON.parse(stored) : null;
      const params = new URLSearchParams(window.location.search);
      const idFromUrl = params.get("id") || parsed?.id;
      setFarmId(idFromUrl || "");

      if (!idFromUrl) {
        setError("Missing farm ID — please create a farm again.");
        setLoading(false);
        return;
      }

      try {
        setError("");
        console.log("Fetching:", `${API_BASE}/api/farms/${idFromUrl}`);
        const res = await fetch(`${API_BASE}/api/farms/${idFromUrl}`);
        const data = await res.json().catch(() => ({}));
        console.log("Response status:", res.status);
        console.log("Response data:", data);
        if (res.ok && data?.farm) {
          setFarm(data.farm);
        } else {
          setError("Farm not found — please create a farm again.");
        }
      } catch (err) {
        console.error("Fetch failed:", err);
        setError("Failed to load farm data.");
      } finally {
        setLoading(false);
      }
    };

    loadFarm();
  }, []);

  if (loading) {
    return (
      <div>
        <h3>Farm ID: {farmId}</h3>
        <p>Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h3>Farm ID: {farmId}</h3>
        <p style={{ color: "red" }}>{error}</p>
      </div>
    );
  }

  if (!farm) {
    return (
      <div>
        <h3>Farm ID: {farmId}</h3>
        <h2>Farm not found</h2>
        <p>Check the URL or create a new farm.</p>
      </div>
    );
  }

  const explorerUrl = farm.tokenId
    ? `https://hashscan.io/testnet/token/${farm.tokenId}`
    : "";

  console.log("Dashboard state:", farm);

  return (
    <div>
      <h3>Farm ID: {farmId}</h3>
      <h2>Farm Dashboard</h2>
      <div style={{ border: "1px solid #16a34a", background: "#dcfce7", padding: "12px", marginBottom: "12px" }}>
        <p style={{ color: "#166534", margin: 0 }}>Success: farm tokenised and ready for demo.</p>
        <p style={{ margin: "6px 0 0 0" }}>Token ID: {farm.tokenId || "N/A"}</p>
        <p style={{ margin: "6px 0 0 0" }}>Max liquidity: GBP {farm.maxSafeTokenisationGBP ?? "N/A"}</p>
      </div>
      <p>name: {farm.name}</p>
      <p>location: {farm.location}</p>
      <p>hectares: {farm.hectares}</p>
      <p>estimatedValueGBP: {farm.estimatedValueGBP}</p>
      <p>maxSafeTokenisationGBP: {farm.maxSafeTokenisationGBP}</p>
      <p>tokenId: {farm.tokenId || "N/A"}</p>
      <p>txId: {farm.txId || "N/A"}</p>
      <p>status: {farm.status}</p>
      {farm.mintedAt && (
        <p>Minted At: {new Date(farm.mintedAt).toLocaleString()}</p>
      )}
      {farm.nextCheck && (
        <p>
          ⏱ Next automatic collateral check:{" "}
          {new Date(farm.nextCheck).toLocaleString()}
        </p>
      )}

      {farm.tokenId && (
        <p>
          <a href={explorerUrl} target="_blank" rel="noreferrer">
            View on Hedera Explorer
          </a>
        </p>
      )}

      {farm.hcsTopicId && (
        <div style={{ marginTop: "20px" }}>
          <h3>Audit Trail (HCS)</h3>
          <p>Topic ID: {farm.hcsTopicId}</p>
          <p>Sequence: {farm.hcsSequenceNumber}</p>
          <p>Running Hash: {farm.hcsRunningHash}</p>
          <p style={{ color: "green" }}>
            Immutable audit trail recorded on Hedera
          </p>
        </div>
      )}

      <pre>{JSON.stringify(farm, null, 2)}</pre>
    </div>
  );
}
