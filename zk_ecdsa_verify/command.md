nargo init/new


# Local proof verification 
nargo check
nargo execute
bb prove -b ./target/zk_ecdsa_verify.json -w ./target/zk_ecdsa_verify.gz --write_vk -o target
bb verify -p ./target/proof -k ./target/vk
cast wallet address --private-key
cast wallet public-key --private-key
cast wallet sign --no-hash 0x1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8 --private-key 

# Remote onchain proof verification
nargo compile
bb write_vk --oracle_hash keccak -b ./target/zk_ecdsa_verify.json -o ./target/onchain
bb write_solidity_verifier -k ./target/onchain/vk -o ./target/Verifier.sol
