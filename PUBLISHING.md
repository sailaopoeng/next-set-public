# Publish the public edition

NextSet was developed privately for personal use. This edition shares a cleaned
source snapshot with fresh history, rather than making the original private
repository public. Personal records and deployment credentials are not part of
the public release.

## What belongs in this repository

Application source, tests, starter exercise/template data, SQL migrations,
dependency manifests/lockfile, and documentation belong here. The public example
configuration contains placeholders and deliberately leaves the owner email and
server secrets blank.

Do not copy the private repository's `.git` directory, environment files, AI
prompt logs, development logs, Supabase `.temp` metadata, Vercel metadata,
database exports, or private planning prompts into this edition. Do not merge
the old private branches or history into the public repository later.

## Upload this prepared folder

The prepared folder contains its own Git repository on `main` with a fresh
initial commit and no remote. Run commands from **this folder**, not from the
original private repository. `git rev-parse --show-toplevel` should identify the
public folder. `git log --oneline --all` should show only the public history.

1. Create a **new, empty** GitHub repository under your account. Choose Public
   only after checking the contents. Do not initialize it with another README,
   `.gitignore`, or license; those create a separate initial history.
2. Verify the local repository and connect your new remote:

   ```bash
   git rev-parse --show-toplevel
   git status --short
   git log --oneline --all
   git remote -v
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_PUBLIC_REPO.git
   git push -u origin main
   ```

Replace both uppercase placeholders. Keep your original private repository
private. Do not reuse its remote or force-push this snapshot over it.

For future commits, set a public display name and copy your exact GitHub noreply
address from GitHub Settings -> Emails into this repository's local configuration:

```bash
git config --local user.name "YOUR_PUBLIC_DISPLAY_NAME"
git config --local user.email "YOUR_GITHUB_NOREPLY_EMAIL"
```

Never paste a token into a remote URL. Authenticate using GitHub CLI, Git
Credential Manager, or SSH. The initial snapshot uses a noreply address rather
than the private history's personal/work email addresses. Verify your exact
account-specific noreply address before future commits if attribution matters.

### If you start from the source ZIP

The ZIP contains source files only; it deliberately excludes `.git`, dependencies,
and build artifacts. Extract it to its own folder and create a fresh repository
before following the remote/push steps above:

```bash
git init --initial-branch=main
git config --local user.name "YOUR_PUBLIC_DISPLAY_NAME"
git config --local user.email "YOUR_GITHUB_NOREPLY_EMAIL"
git add .
git diff --cached --check
git commit -m "Initial public release of NextSet"
```

[GitHub's upload guide](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)
and [email privacy documentation](https://docs.github.com/en/account-and-profile/concepts/email-addresses)
describe these settings.

## Check before every public push

- Review `git status --short` and `git diff --cached`; `.gitignore` does not protect
  files already tracked or intentionally force-added.
- Keep actual values only in ignored local env files or deployment settings.
- Inspect new logs, screenshots, fixtures, SQL data, and AI prompts for personal
  information. Use synthetic examples in public bug reports and tests.
- Check commit author/committer emails; changing Git config does not rewrite old
  commits. Never import old private history to preserve its commit attribution.
- Run lint, typecheck, tests, and build. Use secret scanning before publishing.
- Review GitHub issues, PR attachments, Actions logs, and artifacts before sharing
  them. Public Actions logs are visible to everyone.

Removing a sensitive file in a later commit leaves earlier versions in history.
If a credential is published, revoke/rotate it and follow
[GitHub's sensitive-data cleanup guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).

## Access warning to keep with the public release

Only the account configured in `ALLOWED_EMAIL` may edit through the app. This is
a single-owner application, not a public sign-up service. Configure Supabase
registration separately. Guest viewing is intentionally public and includes
real workout data; source publication and data privacy are separate choices.
Keep these warnings in the README when adapting the project.
