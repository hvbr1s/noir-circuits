use dep::poseidon::poseidon;

global TREE_DEPTH: u32 = 21; // 2,097,152 leaves


#[export]
fn main(address: Field, siblings: [Field; TREE_DEPTH], indices: [Field; TREE_DEPTH], root: pub Field) {
    let computed_root = compute_merkle_root(address, siblings, indices);
    assert(computed_root == root);
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