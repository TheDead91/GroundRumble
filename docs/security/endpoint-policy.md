# Endpoint Policy

GroundRumble rejects provider endpoints that target private, loopback, local,
or special-use destinations unless the provider's **Allow private/loopback
endpoint** setting is explicitly enabled. This approval is stored with that
provider and is not inferred from the connector or endpoint form.

The policy applies after URL canonicalization, including hexadecimal IPv4-
mapped (`::ffff:c0a8:101`) and IPv4-compatible (`::c0a8:101`) IPv6 forms. It
also rejects IPv6 unspecified, loopback, unique-local, link-local, multicast,
discard-only, documentation, benchmarking (`2001:2::/48`), orchid
(`2001:10::/28`), and reserved ranges. Public GitHub source handling remains
unchanged and does not use private endpoint approval.
