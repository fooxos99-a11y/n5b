# Website releases

The repository stores source code. The server retains the database, runtime data,
environment settings and shared dependencies. None of those are uploaded to Git.

1. Push a branch and open a pull request. `Verify project` checks the code.
2. Merge the reviewed changes into `main`.
3. Every push to `main` starts **Deploy website** automatically. **Run workflow**
   on `main` is also available for a manual retry.
4. The workflow verifies, builds and sends a checksummed release to the server.
   Failed service/health checks restore the previous release. Pending database
   migrations stop the deployment before activation and need a separate reviewed
   migration with a backup.

Deployment configuration comes from the locally ignored `data1.yml`. Its build
commands and restricted SSH credentials are provisioned as GitHub secrets. The
server-owned receiver and configuration are installed separately; a website
archive cannot overwrite them. SSH host keys are verified, not accepted on trust.
The deployment account runs only this project's services, with its own PM2 home
and database grants. The API binds to loopback behind the reverse proxy.
Runtime dependencies are installed without lifecycle scripts; Puppeteer's Chrome
is explicitly installed and checked because WhatsApp uses it in production.

Only the current and previous successful GitHub releases are retained. Legacy
release directories require a one-time dependency/data audit before removal.
Database backups have an independent retention policy.

## Native apps

Website deployment never uploads a mobile application. The existing **iOS Build
and TestFlight** workflow builds iOS; its publish option uploads a signed build to
TestFlight. **Submit iOS app to App Store Review** is a separate operation.
Android signed APK/AAB builds currently use `scripts/build-android-release.ps1`.
Android store publication is not configured by the website workflow. Both native
apps retain their existing identifiers and API endpoints. Changes bundled inside
the apps require new native builds and the appropriate store release.
