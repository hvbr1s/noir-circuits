nargo init/new
nargo check
nargo execute
bb prove -b ./target/zk_ecdsa_verify.json -w ./target/zk_ecdsa_verify.gz --write_vk -o target
bb verify -p ./target/proof -k ./target/vk

cast wallet address --private-key
cast wallet public-key --private-key
cast wallet sign --no-hash 0x1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8 --private-key 
