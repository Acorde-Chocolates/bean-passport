window.BP_CONFIG = {
  cluster: "devnet",
  rpcUrl: "https://api.devnet.solana.com",
  issuer: "2efnZyHE9ru1KwU4KiGRj6RgwZyrBwm4k9hSgdUfVeiy",
  testIssuer: "9MGPxpAMQ8VwzCksTinWceSuZqrodX5WDhikBtfHXBWV",
  issuerFor(lot) { return /^TEST-/.test(lot) ? this.testIssuer : this.issuer; },
  memoProgram: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
  explorerTx: signature => `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`,
  explorerAddress: address => `https://explorer.solana.com/address/${encodeURIComponent(address)}?cluster=devnet`,
  publicPage: lot => `lote/?id=${encodeURIComponent(lot)}`
};
