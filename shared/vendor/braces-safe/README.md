# Bounded braces fork

Private, vendored fork of `braces@3.0.3` from the npm registry. The original MIT
license and attribution are retained. The source tarball was verified against
the registry's SHA-512 integrity before copying `index.js`, `lib/`, and `LICENSE`.

This fork addresses [CVE-2026-93687](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
while no patched upstream release exists. Parsing rejects excessive nesting
before building deeper blocks; iterative AST validation runs before recursive
compile, expand, and stringify operations, including caller-supplied ASTs.
Child depth is limited to 128 and cannot be disabled by options. Excessive depth
throws a controlled `SyntaxError` with code `ERR_BRACES_DEPTH`.

The only other source change removes an upstream debug log in `compile.js`.
Normal brace alternatives, ranges, escaping, and the existing range/length
limits are retained. `tests/bracesSecurity.test.js` covers malicious input and
compatibility through micromatch, fast-glob, and Tailwind compilation.

The npm override installs this private package under the `braces` module name.
The distinct package identity records the patched fork; it does not claim an
upstream fix or suppress npm audit. Replace the override with a verified patched
upstream release when one becomes available, retaining the regression tests.
