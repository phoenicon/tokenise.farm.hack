const {
  Client,
  PrivateKey,
  ScheduleCreateTransaction,
  TransferTransaction,
  AccountId,
  Timestamp
} = require("@hashgraph/sdk");

async function scheduleCollateralCheck(farmId, tokenId, daysUntilCheck = 30) {
  const operatorId = process.env.OPERATOR_ID ? AccountId.fromString(process.env.OPERATOR_ID) : null;
  const operatorKey = process.env.OPERATOR_KEY ? PrivateKey.fromStringECDSA(process.env.OPERATOR_KEY) : null;

  if (!operatorId || !operatorKey) {
    throw new Error("Operator credentials missing for schedule setup");
  }

  const network = process.env.HEDERA_NETWORK || "testnet";
  const client = Client.forName(network).setOperator(operatorId, operatorKey);

  const now = new Date();
  const futureTime = new Date(now.getTime() + (daysUntilCheck * 24 * 60 * 60 * 1000));
  const executionTime = Timestamp.fromDate(futureTime);

  const scheduledInnerTx = new TransferTransaction()
    .addHbarTransfer(operatorId, 0)
    .setTransactionMemo(`Collateral check for farm ${farmId} token ${tokenId}`);

  const scheduleTx = new ScheduleCreateTransaction()
    .setScheduledTransaction(scheduledInnerTx)
    .setAdminKey(operatorKey.publicKey)
    .setExpirationTime(executionTime)
    .freezeWith(client);

  const signedScheduleTx = await scheduleTx.sign(operatorKey);
  const txResponse = await signedScheduleTx.execute(client);
  const receipt = await txResponse.getReceipt(client);

  return {
    scheduleId: receipt.scheduleId ? receipt.scheduleId.toString() : null,
    executionTime: futureTime.toISOString()
  };
}

module.exports = { scheduleCollateralCheck };