#!/usr/bin/env bash
if [[ -d "./lib" ]]; then
    rm -f ./lib/*
fi
npm run format
npm run build
npm publish --access=public --force
