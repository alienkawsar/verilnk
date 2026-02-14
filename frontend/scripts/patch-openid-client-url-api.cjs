#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const frontendRoot = path.resolve(__dirname, '..');
const openIdClientLibRoot = path.join(frontendRoot, 'node_modules', 'openid-client', 'lib');

function replaceOrSkip(source, from, to, label, filePath) {
  if (to.length > 0 && source.includes(to)) {
    return source;
  }

  if (!source.includes(from)) {
    if (to.length === 0) {
      return source;
    }

    throw new Error(`Could not apply replacement "${label}" in ${filePath}`);
  }

  return source.replace(from, to);
}

function patchFile(relativePath, replacements) {
  const filePath = path.join(openIdClientLibRoot, relativePath);

  if (!fs.existsSync(filePath)) {
    return { filePath, changed: false, missing: true };
  }

  const before = fs.readFileSync(filePath, 'utf8');
  let after = before;

  for (const replacement of replacements) {
    after = replaceOrSkip(after, replacement.from, replacement.to, replacement.label, filePath);
  }

  if (after !== before) {
    fs.writeFileSync(filePath, after, 'utf8');
    return { filePath, changed: true, missing: false };
  }

  return { filePath, changed: false, missing: false };
}

function run() {
  if (!fs.existsSync(openIdClientLibRoot)) {
    console.log('[patch-openid-client-url-api] openid-client is not installed, skipping');
    return;
  }

  const results = [];

  results.push(
    patchFile('issuer.js', [
      {
        label: 'issuer require',
        from: "const url = require('url');\n",
        to: "const { URL } = require('url');\n",
      },
      {
        label: 'webfinger host parse',
        from: '    const { host } = url.parse(resource);\n',
        to: '    const host = new URL(resource).host;\n',
      },
      {
        label: 'resolveWellKnownUri',
        from: `function resolveWellKnownUri(uri) {
  const parsed = url.parse(uri);
  if (parsed.pathname.includes('/.well-known/')) {
    return uri;
  } else {
    let pathname;
    if (parsed.pathname.endsWith('/')) {
      pathname = \`\${parsed.pathname}.well-known/openid-configuration\`;
    } else {
      pathname = \`\${parsed.pathname}/.well-known/openid-configuration\`;
    }
    return url.format({ ...parsed, pathname });
  }
}
`,
        to: `function resolveWellKnownUri(uri) {
  const parsed = new URL(uri);
  if (parsed.pathname.includes('/.well-known/')) {
    return parsed.toString();
  } else {
    let pathname;
    if (parsed.pathname.endsWith('/')) {
      pathname = \`\${parsed.pathname}.well-known/openid-configuration\`;
    } else {
      pathname = \`\${parsed.pathname}/.well-known/openid-configuration\`;
    }
    parsed.pathname = pathname;
    return parsed.toString();
  }
}
`,
      },
    ]),
  );

  results.push(
    patchFile('client.js', [
      {
        label: 'client require',
        from: "const url = require('url');\n",
        to: '',
      },
      {
        label: 'getSearchParams',
        from: `function getSearchParams(input) {
  const parsed = url.parse(input);
  if (!parsed.search) return {};
  return querystring.parse(parsed.search.substring(1));
}
`,
        to: `function getSearchParams(input) {
  let parsed;
  try {
    parsed = new URL(input, 'http://localhost');
  } catch {
    return {};
  }
  if (!parsed.search) return {};
  return querystring.parse(parsed.search.substring(1));
}
`,
      },
      {
        label: 'endSessionUrl target parse/format',
        from: `    const target = url.parse(this.issuer.end_session_endpoint);
    const query = defaults(
      getSearchParams(this.issuer.end_session_endpoint),
      params,
      {
        post_logout_redirect_uri,
        client_id: this.client_id,
      },
      { id_token_hint },
    );

    Object.entries(query).forEach(([key, value]) => {
      if (value === null || value === undefined) {
        delete query[key];
      }
    });

    target.search = null;
    target.query = query;

    return url.format(target);
`,
        to: `    const target = new URL(this.issuer.end_session_endpoint);
    const query = defaults(
      getSearchParams(this.issuer.end_session_endpoint),
      params,
      {
        post_logout_redirect_uri,
        client_id: this.client_id,
      },
      { id_token_hint },
    );

    const nextSearch = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value === null || value === undefined) return;

      if (Array.isArray(value)) {
        value.forEach((member) => nextSearch.append(key, String(member)));
        return;
      }

      nextSearch.set(key, String(value));
    });

    target.search = nextSearch.toString();

    return target.toString();
`,
      },
    ]),
  );

  results.push(
    patchFile('passport_strategy.js', [
      {
        label: 'passport require',
        from: "const url = require('url');\n",
        to: "const { URL } = require('url');\n",
      },
      {
        label: 'passport session key hostname',
        from: '  this._key = sessionKey || `oidc:${url.parse(this._issuer.issuer).hostname}`;\n',
        to: '  this._key = sessionKey || `oidc:${new URL(this._issuer.issuer).hostname}`;\n',
      },
      {
        label: 'passport name hostname',
        from: '  this.name = url.parse(client.issuer.issuer).hostname;\n',
        to: '  this.name = new URL(client.issuer.issuer).hostname;\n',
      },
    ]),
  );

  const changedFiles = results.filter((entry) => entry.changed).map((entry) => entry.filePath);
  const missingFiles = results.filter((entry) => entry.missing).map((entry) => entry.filePath);

  if (missingFiles.length > 0) {
    console.log(`[patch-openid-client-url-api] skipped missing files: ${missingFiles.join(', ')}`);
  }

  if (changedFiles.length === 0) {
    console.log('[patch-openid-client-url-api] already patched');
    return;
  }

  console.log(`[patch-openid-client-url-api] patched ${changedFiles.length} file(s)`);
}

run();
