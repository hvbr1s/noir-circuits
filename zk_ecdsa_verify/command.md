nargo init/new
nargo check
nargo compile
nargo execute
bb prove -b ./target/zk_ecdsa_verify.json -w ./target/zk_ecdsa_verify.gz --write_vk -o target
bb verify -p ./target/proof -k ./target/vk

cast wallet address --private-key
cast wallet public-key --private-key
cast wallet sign --no-hash 0x1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8 --private-key 

## To work with a verifier smart contract
nargo compile
### For onchain verification of a proof, use an oracle_hash which is more efficient
bb write_vk --oracle_hash keccak -b ./target/zk_ecdsa_verify.json -o ./target/vk_onchain
### Generate the verifier contract
bb write_solidity_verifier -k ./target/vk_onchain/vk -o ./target/Verifier.sol