#!/bin/bash

# Script to generate Prover.toml from inputs.txt

INPUT_FILE="inputs.txt"
OUTPUT_FILE="Prover.toml"

# Function to convert hex string to byte array format for Noir
hex_to_byte_array() {
    local hex="$1"
    # Remove 0x prefix if present
    hex="${hex#0x}"

    local result="["
    local len=${#hex}
    local first=true

    for ((i=0; i<len; i+=2)); do
        byte="${hex:$i:2}"
        if [ "$first" = true ]; then
            first=false
        else
            result+=", "
        fi
        # Convert hex byte to decimal
        decimal=$((16#$byte))
        result+="\"$decimal\""
    done

    result+="]"
    echo "$result"
}

# Read values from inputs.txt
while IFS='=' read -r key value; do
    # Trim whitespace
    key=$(echo "$key" | xargs)
    value=$(echo "$value" | xargs | tr -d '"')

    case "$key" in
        "expected_address")
            EXPECTED_ADDRESS="$value"
            ;;
        "hashed_message")
            HASHED_MESSAGE="$value"
            ;;
        "pub_key_x")
            PUB_KEY_X="$value"
            ;;
        "pub_key_y")
            PUB_KEY_Y="$value"
            ;;
        "signature")
            # Strip last byte (recovery byte v) - 65 bytes -> 64 bytes
            value="${value#0x}"
            value="0x${value:0:128}"  # Keep only first 64 bytes (128 hex chars)
            SIGNATURE="$value"
            ;;
    esac
done < "$INPUT_FILE"

# Generate Prover.toml
cat > "$OUTPUT_FILE" << EOF
expected_address = "$EXPECTED_ADDRESS"
hashed_message = $(hex_to_byte_array "$HASHED_MESSAGE")
pub_key_x = $(hex_to_byte_array "$PUB_KEY_X")
pub_key_y = $(hex_to_byte_array "$PUB_KEY_Y")
signature = $(hex_to_byte_array "$SIGNATURE")
EOF

echo "Generated $OUTPUT_FILE from $INPUT_FILE"
