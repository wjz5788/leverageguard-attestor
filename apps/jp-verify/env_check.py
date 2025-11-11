#!/usr/bin/env python3
import os
import sys

errors = []

def req(name):
    v = os.getenv(name)
    if not v or not str(v).strip():
        errors.append(f"{name} missing")

# minimal set
req('EVIDENCE_DIR')

if errors:
    print("\n⛔ jp-verify env check failed:")
    for e in errors:
        print(" - " + e)
    sys.exit(2)
else:
    print("✅ jp-verify env ok")

