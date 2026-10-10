window.BP_CONFIG = {
  cluster: "devnet",
  rpcUrl: "https://api.devnet.solana.com",
  issuer: "",
  memoProgram: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
  explorerTx: signature => `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`,
  explorerAddress: address => `https://explorer.solana.com/address/${encodeURIComponent(address)}?cluster=devnet`
};
