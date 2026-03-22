import { useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "https://tokenise-farm-hack.onrender.com";

const postJson = async (url, payload) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
};

const createAndTokeniseFarm = async (formData) => {
  const createData = await postJson(`${API_BASE}/api/farms`, {
    name: formData.name,
    location: formData.location,
    hectares: Number(formData.acreage),
    estimatedValueGBP: Number(formData.value)
  });

  const farmId = createData?.farm?.id;
  if (!farmId) {
    throw new Error("Farm created but id missing in response");
  }

  const tokeniseData = await postJson(`${API_BASE}/api/farms/${farmId}/tokenise`, {});
  return { farmId, createData, tokeniseData };
};

export default function CreateFarm() {
  const [formData, setFormData] = useState({
    name: "",
    location: "",
    acreage: "",
    value: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { farmId, createData, tokeniseData } = await createAndTokeniseFarm(formData);
      const farmFromApi = tokeniseData?.farm || createData?.farm || {};
      const farmForSession = {
        id: farmId,
        ...farmFromApi,
        tokenId: tokeniseData?.tokenId || farmFromApi?.tokenId || null,
        txId: tokeniseData?.txId || null,
        scheduleId: tokeniseData?.scheduleId || null,
        nextCheck: tokeniseData?.nextCheck || null,
        hcsTopicId: tokeniseData?.hcsTopicId || null,
        hcsSequenceNumber: tokeniseData?.hcsSequenceNumber || null,
        hcsRunningHash: tokeniseData?.hcsRunningHash || null
      };

      sessionStorage.setItem("farm", JSON.stringify(farmForSession));
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Create Farm</h2>
      <form onSubmit={handleSubmit}>
        <input
          name="name"
          placeholder="Farm name"
          value={formData.name}
          onChange={handleChange}
          required
        />
        <input
          name="location"
          placeholder="Location"
          value={formData.location}
          onChange={handleChange}
          required
        />
        <input
          name="acreage"
          type="number"
          placeholder="Hectares"
          value={formData.acreage}
          onChange={handleChange}
        />
        <input
          name="value"
          type="number"
          placeholder="Estimated value GBP"
          value={formData.value}
          onChange={handleChange}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? "Submitting..." : "Create + Tokenise"}
        </button>
      </form>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}
