use dep::keccak256::keccak256;

fn main(
    hashed_message: [u8; 32],
    pub_key_x: [u8; 32],
    pub_key_y: [u8; 32],
    signature: [u8; 64],
    expected_address: Field
) -> pub Field {
    // verify sig
    let valid_signature =
        std::ecdsa_secp256k1::verify_signature(pub_key_x, pub_key_y, signature, hashed_message);
    assert(valid_signature);

    // derive EVM address
    let mut pub_key: [u8; 64] = [0; 64];
    for i in 0..32 {
        pub_key[i] = pub_key_x[i];
        pub_key[i + 32] = pub_key_y[i];
    }

    let hash: [u8; 32] = keccak256(pub_key, 64);

    // last 20 bytes of the hash == EVM address
    let mut evm_address: Field = 0;
    for i in 12..32 {
        evm_address = evm_address * 256 + hash[i] as Field;
    }
    assert(evm_address != 0);
    assert(evm_address == expected_address);

    evm_address
}
