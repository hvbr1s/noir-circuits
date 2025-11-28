nargo init/new
nargo check
nargo execute
bb prove -b ./target/cyfrin_noir.json -w ./target/cyfrin_noir.gz --write_vk -o target
bb verify -p ./target/proof -k ./target/vk