# Security Policy

## Supported Versions
| Version | Supported |
|---------|-----------|
| main    | ✅
| others  | ℹ️ Review on a best-effort basis |

Security fixes are landed on `main` first and cherry-picked to release branches when applicable.

## Reporting a Vulnerability
- Email: security@wjz5788.com (PGP fingerprint `236A 4E7D 9C67 82BE 1D0F 420E 8B01 1F90 C8D5 6A96`).
- Backup contact: zmshyc@gmail.com
- Please include a clear description, reproduction steps, and potential impact. Attach proof-of-concept code if available.

### Response Targets
- Acknowledge report within **48 hours**.
- Provide triage decision within **5 business days**.
- Coordinate fix or disclosure timeline within **15 business days**.

## Safe Harbor
We will not pursue legal action against security researchers who:
1. Make a good faith effort to avoid privacy violations, data destruction, or service disruption.
2. Provide us a reasonable time to remediate before public disclosure.
3. Comply with applicable laws and do not profit from the vulnerability.

## Out of Scope
- Attacks requiring physical access to user devices.
- Social engineering of LiqPass staff, partners, or users.
- Denial-of-service vectors that require overwhelming external infrastructure (e.g., massive transaction spam).

## Coordinated Disclosure
We publish remediation notes in `docs/09_合规审计-AuditCompliance/security-advisories/` and notify impacted partners prior to public statements. Critical patches receive priority hotfix releases.
