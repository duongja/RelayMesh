# contracts

Foundry project. BOT testnet (chain 968) only.

```bash
forge build
forge test -vv
OPERATOR_PRIVATE_KEY=0x... BOT_RPC_URL=https://rpc.bohr.life \
  forge script script/Deploy.s.sol --rpc-url $BOT_RPC_URL --broadcast
```

Set `REGISTRY_ADDRESS` + `LEDGER_ADDRESS` in `coordinator/.env` after deploy.
Verify on https://scan.bohr.life.
