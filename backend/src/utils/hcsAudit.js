const {
  Client,
  AccountId,
  PrivateKey,
  TopicId,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction
} = require("@hashgraph/sdk");

let runtimeTopicId = process.env.HCS_TOPIC_ID || null;

const getClient = () => {
  const operatorId = AccountId.fromString(process.env.OPERATOR_ID);
  const operatorKey = PrivateKey.fromStringECDSA(process.env.OPERATOR_KEY);
  const network = process.env.HEDERA_NETWORK || "testnet";
  const client = Client.forName(network);
  client.setOperator(operatorId, operatorKey);
  return client;
};

async function ensureAuditTopic() {
  if (runtimeTopicId) {
    return runtimeTopicId;
  }

  const client = getClient();
  const createTx = await new TopicCreateTransaction()
    .setTopicMemo("Tokenise.Farm Audit Trail")
    .execute(client);
  const receipt = await createTx.getReceipt(client);
  runtimeTopicId = receipt.topicId.toString();
  return runtimeTopicId;
}

async function submitAuditMessage(topicId, payload) {
  const client = getClient();
  const topicMessage = JSON.stringify(payload);
  const submitTx = await new TopicMessageSubmitTransaction()
    .setTopicId(TopicId.fromString(topicId))
    .setMessage(topicMessage)
    .execute(client);
  const receipt = await submitTx.getReceipt(client);
  const sequenceNumber = receipt.topicSequenceNumber ? receipt.topicSequenceNumber.toString() : null;
  const runningHash = receipt.topicRunningHash ? Buffer.from(receipt.topicRunningHash).toString("hex") : null;

  console.log(`[HCS] Audit message submitted to topic ${topicId} (sequence: ${sequenceNumber || "N/A"})`);

  return {
    topicId,
    sequenceNumber,
    runningHash,
    topicMessage
  };
}

module.exports = { ensureAuditTopic, submitAuditMessage };
