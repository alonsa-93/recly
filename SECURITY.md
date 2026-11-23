# Security policy

Recly's promise is that a recording never leaves the user's computer, so reports that touch it are taken seriously.

## Reporting a vulnerability
Please **do not** open a public issue for a security problem.
Report it privately through GitHub: open the **Security** tab of this repository and choose
**Report a vulnerability**. Include what you found, how to reproduce it, and what an attacker could do.

You will get a reply as soon as possible. Once a fix is ready, the report can be published with credit to you.

## Scope
In scope: anything that could send a recording, audio, captions or settings anywhere off the computer;
load code from outside the site (other than the consented captions model download); let another site
read Recly's storage; or make the local server (`server.ps1`) serve files outside the app folder or to
other machines.

## Supported versions
Only the latest version on the `main` branch receives security fixes.
