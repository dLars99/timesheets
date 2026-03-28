#!/usr/bin/env bash
set -euo pipefail

APP_PATH="/Applications/Timesheets.app"

if [ ! -d "$APP_PATH" ]; then
  echo "Error: Timesheets.app not found at $APP_PATH"
  echo "Please drag Timesheets.app from the .dmg into your Applications folder first, then re-run this script."
  exit 1
fi

echo "Removing macOS quarantine flag from $APP_PATH ..."
sudo xattr -rd com.apple.quarantine "$APP_PATH"
echo "Done. You can now open Timesheets normally."
