#!/usr/bin/env bash
# Install Chrome for Puppeteer on Render (native environment).
# See backend/RENDER.md for Render dashboard setup.
set -o errexit

STORAGE_DIR=/opt/render/project/.render

if [[ ! -d $STORAGE_DIR/chrome ]]; then
  echo "... Downloading Chrome for Puppeteer"
  mkdir -p $STORAGE_DIR/chrome
  cd $STORAGE_DIR/chrome
  wget -q -O google-chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  # Extract without full dpkg to avoid EOF errors on Render
  ar x google-chrome.deb
  tar -xf data.tar.xz -C $STORAGE_DIR/chrome
  rm -f google-chrome.deb control.tar.* data.tar.xz debian-binary
  cd - > /dev/null
else
  echo "... Using cached Chrome"
fi
