const {
  ScheduleCreateTransaction,
  TransferTransaction,
  Timestamp
} = require("@hashgraph/sdk");

async function scheduleCollateralCheck(client, operatorId, operatorKey, farmId, tokenId, daysUntilCheck = 30) {
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