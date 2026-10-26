Public Supabase root CA, downloaded over HTTPS from:

https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

SHA-256 certificate fingerprint:
`807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`

The pg adapter trusts this CA for shared Supabase pooler hosts and still verifies
the server hostname. It does not change the operating system trust store.

Provider guidance: https://supabase.com/docs/guides/platform/ssl-enforcement
