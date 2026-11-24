# Keeping the Skill current

GitHub (`chenlin666/dramastudio`, `main`) is the only source of truth. A local Skill directory is a cache: never hand-edit installed files, and never install a different repository by name.

## Pi

Install the repository as a git package, using the default branch (do **not** pin a tag or commit if you want passive updates):

```sh
pi install git:github.com/chenlin666/dramastudio
```

Pi discovers `dramastudio/SKILL.md` through the `pi.skills` manifest in `package.json`. After a publish, refresh once with:

```sh
pi update --extensions
```

To fetch the default branch on every launch instead, run Pi per invocation with `-e`:

```sh
pi -e git:github.com/chenlin666/dramastudio
```

`-e` git packages are fetched and reset to the remote branch at each start; when offline or when the check fails, Pi uses the cached copy.

## Other hosts with a trusted shell and network

Install the whole `dramastudio/` directory into the host's user-level Skills directory once. Before each DramaStudio session (or whenever the user asks whether the Skill is current), run from that directory:

```sh
node scripts/refresh-skill.mjs
```

The script fetches `SKILL.md`, `references/connection.md`, and `scripts/mcp-client.mjs` from this repository's `main`, validates them, and atomically replaces the local copies only when all three succeed. It accepts no credentials and never reads the API Key. `node scripts/refresh-skill.mjs --check` reports drift without writing. Set `DRAMASTUDIO_SKILL_OFFLINE=1` to skip network access and keep the cached copy.

If the host is chat-only or cannot run a trusted shell/network fetch, it cannot update passively; after a release, reinstall from the GitHub repository instead of reusing an old copied `SKILL.md`.

## Publishing rule

Every Skill change must land here first. The site guide always links to this repository and its Raw `SKILL.md`; it never hosts a mirror. After merging to `main`, verify with `node scripts/refresh-skill.mjs --check` in a clean install before announcing the release.
