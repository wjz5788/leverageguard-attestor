export function getExplorerTxUrl(params: {
  chainId: number | null | undefined;
  txHash: string | null | undefined;
}): string {
  const { chainId, txHash } = params;
  if (!txHash || txHash.length === 0) return "";
  switch (chainId) {
    case 8453:
    case undefined:
    case null:
      return `https://basescan.org/tx/${txHash}`;
    default:
      return "";
  }
}
