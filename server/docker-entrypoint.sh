#!/bin/sh
set -e

# Docker entrypoint script for INTACT server
# Handles database seeding on first startup

# Use a data directory for persistent marker (can be mounted as volume)
DATA_DIR="${DATA_DIR:-/app/data}"
SEED_MARKER="$DATA_DIR/.seeded"

# Ensure data directory exists
ensure_data_dir() {
    if [ ! -d "$DATA_DIR" ]; then
        mkdir -p "$DATA_DIR" 2>/dev/null || true
    fi
}

# Wait for MongoDB to be ready (with timeout)
wait_for_mongodb() {
    echo "Waiting for MongoDB to be ready..."
    max_attempts=30
    attempt=0

    while [ $attempt -lt $max_attempts ]; do
        # Try to connect to MongoDB using a simple health check
        if bun -e "
            const mongoose = require('mongoose');
            mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/intact', {
                serverSelectionTimeoutMS: 2000
            }).then(() => {
                console.log('MongoDB is ready');
                process.exit(0);
            }).catch(() => {
                process.exit(1);
            });
        " 2>/dev/null; then
            return 0
        fi

        attempt=$((attempt + 1))
        echo "MongoDB not ready yet (attempt $attempt/$max_attempts)..."
        sleep 2
    done

    echo "Warning: Could not verify MongoDB connection, proceeding anyway..."
    return 0
}

# Run database seeding if not already done
run_seed() {
    if [ "$SEED_ON_STARTUP" = "true" ] || [ "$SEED_ON_STARTUP" = "1" ]; then
        ensure_data_dir

        if [ ! -f "$SEED_MARKER" ]; then
            echo "First startup detected, running database seed..."

            # Wait for MongoDB
            wait_for_mongodb

            # Run the seed script
            if bun src/seed/index.ts; then
                # Create marker file to prevent re-seeding
                touch "$SEED_MARKER" 2>/dev/null || true
                echo "Database seeding completed successfully!"
            else
                echo "Warning: Database seeding failed, but continuing startup..."
            fi
        else
            echo "Database already seeded (marker file exists), skipping..."
        fi
    else
        echo "SEED_ON_STARTUP not enabled, skipping database seed..."
    fi
}

# Main entrypoint logic
main() {
    # Run seeding if enabled
    run_seed

    # Execute the main command
    echo "Starting INTACT server..."
    exec "$@"
}

main "$@"
