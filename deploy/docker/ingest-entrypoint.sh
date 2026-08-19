#!/bin/sh
set -e

DATA_DIR=/app/data
mkdir -p "$DATA_DIR"
chown -R node:node "$DATA_DIR"

exec su-exec node "$@"
