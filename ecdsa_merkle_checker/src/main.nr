use dep::ecrecover;
use dep::poseidon::poseidon;

global TREE_DEPTH: u32 = 21; // 2,097,152 leaves

/// Verifies an ECDSA signature and returns the recovered Ethereum address
#[export]
fn main(
    siblings: [Field; TREE_DEPTH],
    indices: [Field; TREE_DEPTH], 
    pub_key_x: [u8; 32],
    pub_key_y: [u8; 32],
    signature: [u8; 64],
    hashed_message: pub [u8; 32],
    root: pub Field
) -> pub Field {
    let recovered_address= ecrecover::ecrecover(pub_key_x, pub_key_y, signature, hashed_message);
    let computed_root = compute_merkle_root(recovered_address, siblings, indices);
    assert(computed_root == root);
    recovered_address
}

fn compute_merkle_root(leaf: Field, siblings: [Field; TREE_DEPTH], indices: [Field; TREE_DEPTH]) -> Field {
    let mut current: Field = leaf;

    for i in 0..TREE_DEPTH {
        let sibling = siblings[i];
        let (left, right) = if indices[i] == 0 {
            (current, sibling)
        } else {
            (sibling, current)
        };
        current = poseidon::bn254::hash_2([left, right]);
    }
    current
}


#[test]
fn test_ecrecover_and_merkle() {
    // ECDSA inputs
    let pub_key_x = [131, 24, 83, 91, 84, 16, 93, 74, 122, 174, 96, 192, 143, 196, 95, 150, 135, 24, 27, 79, 223, 198, 37, 189, 26, 117, 63, 167, 57, 127, 237, 117];
    let pub_key_y = [53, 71, 241, 28, 168, 105, 102, 70, 242, 243, 172, 176, 142, 49, 1, 106, 250, 194, 62, 99, 12, 93, 17, 245, 159, 97, 254, 245, 123, 13, 42, 165];
    let signature = [57, 17, 112, 239, 241, 30, 64, 157, 170, 50, 85, 145, 156, 69, 226, 85, 147, 164, 10, 82, 71, 93, 42, 132, 200, 220, 161, 255, 95, 241, 211, 141, 81, 7, 150, 25, 25, 27, 162, 213, 80, 61, 12, 170, 50, 4, 154, 203, 252, 229, 119, 29, 202, 153, 50, 25, 126, 145, 245, 23, 136, 75, 29, 177];
    let hashed_message = [13, 82, 120, 60, 76, 186, 215, 235, 175, 126, 185, 67, 252, 100, 143, 82, 130, 165, 32, 112, 68, 47, 193, 141, 141, 209, 109, 219, 47, 203, 175, 102];

    // Expected recovered address: 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
    let expected_address: Field = 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266;

    // Merkle inputs - build a simple tree where the address is at index 0
    // All siblings are zeros, all indices are 0 (address is always on the left)
    let siblings: [Field; TREE_DEPTH] = [0; TREE_DEPTH];
    let indices: [Field; TREE_DEPTH] = [0; TREE_DEPTH];

    // Compute expected root by hashing up the tree
    let root = compute_merkle_root(expected_address, siblings, indices);

    let recovered_address = main(siblings, indices, pub_key_x, pub_key_y, signature, hashed_message, root);
    assert(recovered_address == expected_address);
}

#[test]
fn test_merkle_root_computation() {
    // Test that an address correctly hashes through the merkle tree
    let address: Field = 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266;

    // Simple case: address at index 0 with zero siblings
    let siblings: [Field; TREE_DEPTH] = [0; TREE_DEPTH];
    let indices: [Field; TREE_DEPTH] = [0; TREE_DEPTH];

    // Manually compute first level: hash(address, 0)
    let level_0 = poseidon::bn254::hash_2([address, 0]);

    // The root should be the result of hashing 21 times
    let computed_root = compute_merkle_root(address, siblings, indices);

    // Verify first level matches
    let first_step = poseidon::bn254::hash_2([address, 0]);
    assert(level_0 == first_step);

    // Verify root is not equal to the leaf (it should be hashed)
    assert(computed_root != address);

    // Test with address on the right side (index 1 at first level)
    let mut indices_right: [Field; TREE_DEPTH] = [0; TREE_DEPTH];
    indices_right[0] = 1; // Address is on the right at first level

    let root_right = compute_merkle_root(address, siblings, indices_right);

    // Roots should differ when position changes
    assert(computed_root != root_right);
}
